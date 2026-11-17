#include "data_store.h"
#include "text_file.h"

#include <chrono>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <set>
#include <sstream>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shellapi.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace fs = std::filesystem;
namespace {

fs::path environmentPath(const char* name)
{
#ifdef _WIN32
    const std::wstring wideName(name, name + std::char_traits<char>::length(name));
    const auto* value = _wgetenv(wideName.c_str());
    return value && *value ? fs::path(value) : fs::path();
#else
    const auto* value = std::getenv(name);
    return value && *value ? fs::u8path(value) : fs::path();
#endif
}

std::string readTextFile(const fs::path& path)
{
    std::ifstream input(path, std::ios::binary);
    if (!input) throw std::runtime_error("无法读取：" + path.u8string());
    std::ostringstream buffer;
    buffer << input.rdbuf();
    if (input.bad()) throw std::runtime_error("读取失败：" + path.u8string());
    auto text = buffer.str();
    if (text.compare(0, 3, "\xEF\xBB\xBF") == 0) text.erase(0, 3);
    return text;
}

Json readJsonFile(const fs::path& path)
{
    try { return Json::parse(readTextFile(path)); }
    catch (const std::exception& error) {
        throw std::runtime_error("数据文件校验失败：" + path.u8string() + "\n" + error.what() + "\n原文件已保留。");
    }
}

void writeTextFile(const fs::path& path, const std::string& text)
{
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    if (!output) throw std::runtime_error("无法创建：" + path.u8string());
    output << text;
    output.close();
    if (!output) throw std::runtime_error("写入失败：" + path.u8string());
}

void replaceFile(const fs::path& from, const fs::path& to)
{
    std::error_code error;
    fs::rename(from, to, error);
    if (error) throw std::runtime_error("无法替换 " + to.u8string() + "：" + error.message());
}

void validateDataset(const Json& raw, DocumentaryCatalog& films, Reviews& reviews)
{
    if (!raw.is_object() || !raw.contains("films") || !raw["films"].is_array()
        || !raw.contains("reviews") || !raw["reviews"].is_array()) {
        throw std::invalid_argument("数据须包含 films 片目数组和 reviews 评价数组。");
    }
    std::size_t number = 0;
    for (const auto& value : raw["films"]) {
        try { films.add(documentaryFromJson(value)); }
        catch (const std::exception& error) { throw std::invalid_argument("第 " + std::to_string(number + 1) + " 条片目：" + error.what()); }
        ++number;
    }
    std::set<std::pair<int, std::string>> keys;
    number = 0;
    for (const auto& value : raw["reviews"]) {
        try {
            const auto review = reviewFromJson(value);
            if (!keys.emplace(review.documentaryId, review.viewerId).second) throw std::invalid_argument("评价重复。");
            reviews.submit(review, films);
        } catch (const std::exception& error) { throw std::invalid_argument("第 " + std::to_string(number + 1) + " 条评价：" + error.what()); }
        ++number;
    }
}

bool sameOpinion(const Review& a, const Review& b)
{
    return a.content == b.content && a.image == b.image && a.narration == b.narration && a.comment == b.comment;
}

} // namespace

DataDirectoryLock::DataDirectoryLock(const fs::path& directory)
{
    fs::create_directories(directory);
#ifdef _WIN32
    handle_ = CreateFileW((directory / ".core.lock").c_str(), GENERIC_READ | GENERIC_WRITE, 0,
                          nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle_ == INVALID_HANDLE_VALUE) {
        handle_ = nullptr;
        throw std::runtime_error("无法独占数据目录（可能已被网页或调试终端使用）：" + directory.u8string());
    }
#else
    handle_ = open((directory / ".core.lock").c_str(), O_CREAT | O_RDWR, 0600);
    if (handle_ < 0 || flock(handle_, LOCK_EX | LOCK_NB) != 0) {
        if (handle_ >= 0) close(handle_);
        handle_ = -1;
        throw std::runtime_error("无法独占数据目录（可能已被网页或调试终端使用）：" + directory.u8string());
    }
#endif
}

DataDirectoryLock::~DataDirectoryLock()
{
#ifdef _WIN32
    if (handle_) CloseHandle(handle_);
#else
    if (handle_ >= 0) { flock(handle_, LOCK_UN); close(handle_); }
#endif
}

StoreOptions launchOptions(int argc, char** argv)
{
    std::vector<fs::path> args;
#ifdef _WIN32
    (void)argc; (void)argv;
    int count = 0;
    auto** wideArgs = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!wideArgs) throw std::runtime_error("无法读取启动参数。");
    for (int i = 0; i < count; ++i) args.emplace_back(wideArgs[i]);
    LocalFree(wideArgs);
#else
    for (int i = 0; i < argc; ++i) args.emplace_back(fs::u8path(argv[i]));
#endif
    auto project = fs::absolute(args.front()).parent_path();
    if (project.filename() == "build" && project.parent_path().filename() == "cpp") project = project.parent_path();
    if (project.filename() == "cpp") project = project.parent_path();
    StoreOptions options{project / "data", project / "resources/catalog-seed.json",
                         project / "web/data/catalog.json", project / "cpp", false};
    const auto data = environmentPath("YINGCHANG_DATA_DIR");
    const auto seed = environmentPath("YINGCHANG_SEED_FILE");
    const auto web = environmentPath("YINGCHANG_LEGACY_WEB_FILE");
    const auto cpp = environmentPath("YINGCHANG_LEGACY_CPP_DIR");
    if (!data.empty()) options.directory = data;
    if (!seed.empty()) options.seedFile = seed;
    if (!web.empty()) options.legacyWebFile = web;
    if (!cpp.empty()) options.legacyCppDirectory = cpp;
    for (std::size_t i = 1; i < args.size(); ++i) {
        const auto flag = args[i].u8string();
        if (flag == "--stdio") options.stdio = true;
        else if (flag == "--data-dir" && i + 1 < args.size()) options.directory = args[++i];
        else throw std::invalid_argument("未知启动参数：" + flag);
    }
    options.directory = fs::absolute(options.directory).lexically_normal();
    return options;
}

void recoverStore(const fs::path& directory)
{
    const auto marker = directory / "transaction.pending";
    if (!fs::exists(marker)) return;
    if (readTextFile(marker) != "YINGCHANG_TRANSACTION_V1\n") throw std::runtime_error("事务标记损坏，请恢复数据备份。");
    for (const auto* file : {"documentaries.txt", "reviews.txt"}) {
        const auto target = directory / file;
        auto staged = target;
        staged += ".tmp";
        if (fs::exists(staged)) replaceFile(staged, target);
        else if (!fs::is_regular_file(target)) throw std::runtime_error("待恢复的数据文件缺失。");
    }
    fs::remove(marker);
    std::cerr << "已完成上次中断的数据保存。\n";
}

void saveDataset(const fs::path& directory, const std::vector<Documentary>& films, const std::vector<Review>& reviews)
{
    const auto marker = directory / "transaction.pending";
    if (fs::exists(marker)) throw StoreRecoveryRequired("存在未完成事务，请重启恢复。");
    try {
        std::string filmText, reviewText;
        for (const auto& film : films) filmText += documentaryToJson(film).dump() + '\n';
        for (const auto& review : reviews) reviewText += reviewToJson(review).dump() + '\n';
        writeTextFile(directory / "documentaries.txt.tmp", filmText);
        writeTextFile(directory / "reviews.txt.tmp", reviewText);
        writeTextFile(marker, "YINGCHANG_TRANSACTION_V1\n");
    } catch (...) {
        // No original file was changed before the durable commit marker.
        std::error_code ignored;
        for (const auto& staged : {directory / "documentaries.txt.tmp", directory / "reviews.txt.tmp", marker}) {
            if (fs::is_regular_file(staged, ignored)) fs::remove(staged, ignored);
        }
        throw;
    }
    try {
        replaceFile(directory / "documentaries.txt.tmp", directory / "documentaries.txt");
        replaceFile(directory / "reviews.txt.tmp", directory / "reviews.txt");
        fs::remove(marker);
    } catch (const std::exception& error) {
        throw StoreRecoveryRequired(std::string("保存尚未完成，请重启系统恢复：") + error.what());
    }
}

void initializeStore(const StoreOptions& options)
{
    recoverStore(options.directory);
    const bool hasFilms = fs::exists(options.directory / "documentaries.txt");
    const bool hasReviews = fs::exists(options.directory / "reviews.txt");
    if (hasFilms && hasReviews) return;
    if (hasFilms || hasReviews) throw std::runtime_error("统一数据目录的两个文件不完整，请从备份恢复；不会重新导入覆盖。");

    const auto seed = readJsonFile(options.seedFile);
    DocumentaryCatalog films(options.directory / "documentaries.txt", false);
    Reviews reviews(options.directory / "reviews.txt", false);
    std::vector<std::pair<fs::path, std::string>> originals;
    bool loadedLegacy = false;
    int contentEdition = 2;
    if (fs::exists(options.legacyWebFile)) {
        const auto web = readJsonFile(options.legacyWebFile);
        validateDataset(web, films, reviews);
        contentEdition = web.value("contentEdition", 1);
        originals.push_back({options.legacyWebFile, "web-catalog.json"});
        loadedLegacy = true;
    }
    const auto oldFilmsFile = options.legacyCppDirectory / "documentaries.txt";
    const auto oldReviewsFile = options.legacyCppDirectory / "reviews.txt";
    if (fs::exists(oldFilmsFile) || fs::exists(oldReviewsFile)) {
        DocumentaryCatalog oldFilms(oldFilmsFile, false);
        Reviews oldReviews(oldReviewsFile, false);
        oldFilms.load();
        oldReviews.load(oldFilms);
        for (const auto& film : oldFilms.all()) {
            const auto* existing = films.findById(film.id);
            if (!existing) films.add(film);
            else {
                const auto& a = *existing;
                if (a.title != film.title || a.category != film.category || a.director != film.director
                    || a.crew != film.crew || a.episodeCount != film.episodeCount || a.synopsis != film.synopsis) {
                    throw std::runtime_error("旧网页与终端片号冲突：" + std::to_string(film.id) + "。原文件已保留，未重分配编号。");
                }
            }
        }
        for (const auto& review : oldReviews.all()) {
            const auto existing = std::find_if(reviews.all().begin(), reviews.all().end(), [&](const Review& item) {
                return item.documentaryId == review.documentaryId && item.viewerId == review.viewerId;
            });
            if (existing == reviews.all().end()) reviews.submit(review, films);
            else if (!sameOpinion(*existing, review)) throw std::runtime_error("旧网页与终端评价冲突，原文件已保留，请先核对：" + review.viewerId);
        }
        if (fs::exists(oldFilmsFile)) originals.push_back({oldFilmsFile, "cpp-documentaries.txt"});
        if (fs::exists(oldReviewsFile)) originals.push_back({oldReviewsFile, "cpp-reviews.txt"});
        loadedLegacy = true;
    }
    if (!loadedLegacy) validateDataset(seed, films, reviews);
    else if (contentEdition < 2 && seed.contains("legacyFilms")) {
        bool isOldDemo = false;
        for (const auto& value : seed["legacyFilms"]) {
            const auto old = documentaryFromJson(value);
            const auto* current = films.findById(old.id);
            if (current && current->title == old.title) {
                auto tagged = *current;
                tagged.details.isDemoFilm = true;
                films.update(tagged);
                isOldDemo = true;
            }
        }
        if (isOldDemo) {
            std::set<int> added;
            for (const auto& value : seed["films"]) {
                auto film = documentaryFromJson(value);
                if (!films.findById(film.id)) { added.insert(film.id); films.add(film); }
            }
            for (const auto& value : seed["reviews"]) {
                const auto review = reviewFromJson(value);
                if (added.count(review.documentaryId)) reviews.submit(review, films);
            }
            if (seed.contains("legacyReviews")) {
                const auto previous = reviews.all();
                for (const auto& review : previous) {
                    for (const auto& value : seed["legacyReviews"]) {
                        const auto baseline = reviewFromJson(value);
                        if (review.documentaryId == baseline.documentaryId && review.viewerId == baseline.viewerId && sameOpinion(review, baseline)) {
                            auto tagged = review;
                            tagged.isSample = true;
                            reviews.submit(tagged, films);
                        }
                    }
                }
            }
        }
    }

    fs::path backup;
    if (!originals.empty()) {
        const auto stamp = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        backup = options.directory / "backups" / ("migration-" + std::to_string(stamp));
        fs::create_directories(backup);
        for (const auto& original : originals) fs::copy_file(original.first, backup / original.second);
    }
    saveDataset(options.directory, films.all(), reviews.all());
    if (!backup.empty()) {
        Json report{{"films", films.all().size()}, {"reviews", reviews.all().size()}, {"dataDirectory", options.directory.u8string()}, {"sources", Json::array()}};
        for (const auto& original : originals) {
            report["sources"].push_back({{"original", original.first.u8string()}, {"backup", (backup / original.second).u8string()}});
            // Archive the old active names only after both unified files were committed.
            std::error_code error;
            fs::rename(original.first, backup / ("original-" + original.second), error);
            if (error) std::cerr << "旧文件备份已保留，但原路径未能归档：" << original.first.u8string() << '\n';
        }
        writeTextFile(backup / "migration.json", report.dump(2));
        std::cerr << "已迁移 " << films.all().size() << " 部影片、" << reviews.all().size() << " 条评价；备份：" << backup.u8string() << '\n';
    }
}
