#include "documentary_catalog.h"
#include "reviews.h"
#include "text_file.h"
#include "core_service.h"

#include <algorithm>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

#ifdef _WIN32
#include <conio.h>
#include <fcntl.h>
#include <io.h>
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <clocale>
#include <cwchar>
#include <termios.h>
#include <unistd.h>
#endif

namespace {

#ifdef _WIN32
bool isConsoleInput()
{
    DWORD mode = 0;
    return GetConsoleMode(GetStdHandle(STD_INPUT_HANDLE), &mode) != 0;
}
#endif

bool readLine(const char* prompt, std::string& line)
{
    std::cout << prompt << std::flush;

#ifdef _WIN32
    // Windows 控制台按宽字符读取，重定向的输入直接按 UTF-8 读取。
    if (isConsoleInput()) {
        std::wstring wideLine;
        if (!std::getline(std::wcin, wideLine)) {
            return false;
        }
        const int length = static_cast<int>(wideLine.size());
        const int byteCount = WideCharToMultiByte(
            CP_UTF8, 0, wideLine.data(), length, nullptr, 0, nullptr, nullptr);
        line.resize(byteCount);
        if (byteCount > 0) {
            WideCharToMultiByte(
                CP_UTF8, 0, wideLine.data(), length, line.data(), byteCount, nullptr, nullptr);
        }
        return true;
    }
#endif

    return static_cast<bool>(std::getline(std::cin, line));
}

bool readPassword(std::string& password)
{
    std::cout << "密码：" << std::flush;
#ifdef _WIN32
    if (isConsoleInput()) {
        for (;;) {
            const int key = _getch();
            if (key == '\r') {
                std::cout << '\n';
                return true;
            }
            if (key == 0 || key == 224) {
                _getch();
            } else if (key == '\b' && !password.empty()) {
                password.pop_back();
                std::cout << "\b \b" << std::flush;
            } else if (key >= 32 && key <= 126) {
                password.push_back(static_cast<char>(key));
                std::cout << '*' << std::flush;
            }
        }
    }
#else
    termios original{};
    if (tcgetattr(STDIN_FILENO, &original) == 0) {
        termios hidden = original;
        hidden.c_lflag &= ~(ECHO | ICANON);
        hidden.c_cc[VMIN] = 1;
        hidden.c_cc[VTIME] = 0;
        if (tcsetattr(STDIN_FILENO, TCSANOW, &hidden) != 0) {
            throw std::runtime_error("无法关闭密码明文回显。");
        }
        int key;
        while ((key = std::cin.get()) != '\n' && key != '\r' && key != EOF && key != 4) {
            if (key == 8 || key == 127) {
                if (!password.empty()) {
                    password.pop_back();
                    std::cout << "\b \b" << std::flush;
                }
            } else if (key >= 32 && key <= 126) {
                password.push_back(static_cast<char>(key));
                std::cout << '*' << std::flush;
            }
        }
        tcsetattr(STDIN_FILENO, TCSANOW, &original);
        std::cout << '\n';
        return key == '\n' || key == '\r';
    }
#endif
    if (!std::getline(std::cin, password)) {
        return false;
    }
    std::cout << std::string(password.size(), '*') << '\n';
    return true;
}

bool readInteger(const char* prompt, int& value)
{
    std::string line;
    if (!readLine(prompt, line)) {
        return false;
    }

    std::istringstream input(line);
    if (!(input >> value) || (input >> std::ws && !input.eof())) {
        throw std::invalid_argument("请输入整数。");
    }
    return true;
}

bool readDocumentaryDetails(Documentary& documentary)
{
    if (!readLine("片名：", documentary.title)) {
        return false;
    }
    if (isBlank(documentary.title)) {
        throw std::invalid_argument("片名不能为空。");
    }

    if (!readLine("类别：", documentary.category)
        || !readLine("导演：", documentary.director)
        || !readLine("主创：", documentary.crew)
        || !readInteger("集数：", documentary.episodeCount)) {
        return false;
    }
    if (documentary.episodeCount <= 0) {
        throw std::invalid_argument("集数必须大于 0。");
    }
    return readLine("简介：", documentary.synopsis);
}

const Documentary& requireDocumentary(const DocumentaryCatalog& catalog, int id)
{
    const auto* documentary = catalog.findById(id);
    if (!documentary) {
        throw std::invalid_argument("找不到片目编号。");
    }
    return *documentary;
}

bool editDocumentary(DocumentaryCatalog& catalog, bool adding)
{
    Documentary documentary;
    if (!readInteger("片目编号：", documentary.id)) {
        return false;
    }
    if (adding && catalog.findById(documentary.id)) {
        throw std::invalid_argument("该编号已存在。");
    }
    if (!adding) {
        documentary.details = requireDocumentary(catalog, documentary.id).details;
    }
    if (!readDocumentaryDetails(documentary)) {
        return false;
    }

    if (adding) {
        catalog.add(documentary);
        std::cout << "片目已保存。\n";
    } else {
        catalog.update(documentary);
        std::cout << "片目已修改。\n";
    }
    return true;
}

bool deleteDocumentary(DocumentaryCatalog& catalog, Reviews& reviews)
{
    int id = 0;
    if (!readInteger("片目编号：", id)) {
        return false;
    }
    const auto& documentary = requireDocumentary(catalog, id);
    std::cout << "将删除《" << documentary.title << "》及其评价。";
    std::string answer;
    if (!readLine("确认删除？(y/n)：", answer)) {
        return false;
    }
    if (answer == "y" || answer == "Y") {
        reviews.removeDocumentary(id, catalog);
        std::cout << "片目已删除。\n";
    } else {
        std::cout << "已取消删除。\n";
    }
    return true;
}

void showDocumentary(const Documentary& documentary)
{
    std::cout << "\n编号：" << documentary.id
              << "\n片名：" << documentary.title
              << "\n类别：" << documentary.category
              << "\n导演：" << documentary.director
              << "\n主创：" << documentary.crew
              << "\n集数：" << documentary.episodeCount
              << "\n简介：" << documentary.synopsis << '\n';
}

void showDocumentaries(const DocumentaryCatalog& catalog)
{
    if (catalog.all().empty()) {
        std::cout << "暂无片目。\n";
        return;
    }

    for (const auto& documentary : catalog.all()) {
        showDocumentary(documentary);
    }
}

void showReview(const Review& review)
{
    std::cout << "观众：" << review.viewerId
              << "  内容：" << review.content << "  画面：" << review.image
              << "  讲解：" << review.narration
              << "  综合分：" << std::fixed << std::setprecision(2) << reviewScore(review)
              << "\n短评：" << review.comment << '\n';
}

void showDocumentaryReviews(int id, const Reviews& reviews)
{
    bool found = false;
    for (const auto& review : reviews.all()) {
        if (review.documentaryId == id) {
            showReview(review);
            found = true;
        }
    }
    if (!found) {
        std::cout << "暂无评价。\n";
    }
}

void showAllReviews(const DocumentaryCatalog& catalog, const Reviews& reviews)
{
    if (reviews.all().empty()) {
        std::cout << "暂无评价。\n";
    }
    for (const auto& review : reviews.all()) {
        const auto& documentary = requireDocumentary(catalog, review.documentaryId);
        std::cout << "\n片号：" << documentary.id << "  片名：" << documentary.title << '\n';
        showReview(review);
    }
}

bool searchByTitle(const DocumentaryCatalog& catalog, const Reviews& reviews)
{
    std::string title;
    if (!readLine("请输入完整片名：", title)) {
        return false;
    }
    if (isBlank(title)) {
        throw std::invalid_argument("请输入片名。");
    }

    bool found = false;
    for (const auto& documentary : catalog.all()) {
        if (documentary.title == title) {
            showDocumentary(documentary);
            showDocumentaryReviews(documentary.id, reviews);
            found = true;
        }
    }
    if (!found) {
        std::cout << "未找到该片目。\n";
    }
    return true;
}

bool readScore(const char* prompt, int& score)
{
    if (!readInteger(prompt, score)) {
        return false;
    }
    if (!isValidScore(score)) {
        throw std::invalid_argument("评分必须是 1 到 5 的整数。");
    }
    return true;
}

bool submitReview(const DocumentaryCatalog& catalog, Reviews& reviews)
{
    Review review;
    if (!readInteger("片目编号：", review.documentaryId)) {
        return false;
    }
    requireDocumentary(catalog, review.documentaryId);
    if (!readLine("观众编号：", review.viewerId)) {
        return false;
    }
    review.viewerId = trimText(review.viewerId);
    if (isBlank(review.viewerId)) {
        throw std::invalid_argument("观众编号不能为空。");
    }
    if (!readScore("内容分（1–5）：", review.content)
        || !readScore("画面分（1–5）：", review.image)
        || !readScore("讲解分（1–5）：", review.narration)
        || !readLine("文字短评：", review.comment)) {
        return false;
    }
    reviews.submit(review, catalog);
    std::cout << "评价已保存。\n";
    return true;
}

std::size_t displayWidth(const std::string& text)
{
    std::size_t width = 0;
#ifdef _WIN32
    const int bytes = static_cast<int>(text.size());
    const int length = MultiByteToWideChar(CP_UTF8, 0, text.data(), bytes, nullptr, 0);
    if (length == 0) {
        return text.size();
    }
    std::wstring wide(length, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), bytes, wide.data(), length);
    std::vector<WORD> types(length);
    if (!GetStringTypeW(CT_CTYPE3, wide.data(), length, types.data())) {
        return wide.size();
    }
    for (const WORD type : types) {
        if (!(type & C3_NONSPACING)) {
            width += type & (C3_FULLWIDTH | C3_IDEOGRAPH) ? 2 : 1;
        }
    }
#else
    std::mbstate_t state{};
    for (std::size_t offset = 0; offset < text.size();) {
        wchar_t character;
        const auto bytes = std::mbrtowc(&character, text.data() + offset, text.size() - offset, &state);
        if (bytes == static_cast<std::size_t>(-1) || bytes == static_cast<std::size_t>(-2)) {
            state = {};
            ++offset;
            ++width;
        } else {
            offset += bytes == 0 ? 1 : bytes;
            width += static_cast<std::size_t>(std::max(0, wcwidth(character)));
        }
    }
#endif
    return width;
}

void printAlignedTable(const std::vector<std::vector<std::string>>& rows)
{
    std::vector<std::size_t> widths(rows.front().size());
    for (const auto& row : rows) {
        for (std::size_t column = 0; column < row.size(); ++column) {
            widths[column] = std::max(widths[column], displayWidth(row[column]));
        }
    }
    for (const auto& row : rows) {
        for (std::size_t column = 0; column < row.size(); ++column) {
            const auto& cell = row[column];
            std::cout << cell;
            if (column + 1 < row.size()) {
                std::cout << std::string(widths[column] - displayWidth(cell) + 2, ' ');
            }
        }
        std::cout << '\n';
    }
}

std::string tableTitle(std::string title)
{
    // 制表符等控制字符会改变列位置，只在表格显示时替换为空格。
    std::replace_if(title.begin(), title.end(),
                    [](unsigned char character) { return character < 32 || character == 127; }, ' ');
    return title;
}

void showRanking(const DocumentaryCatalog& catalog, const Reviews& reviews,
                 const char* title = "推荐榜", ScoreFunction score = reviewScore)
{
    const auto ranking = buildRanking(catalog, reviews, score);
    if (ranking.empty()) {
        std::cout << "暂无已评分片目。\n";
        return;
    }
    std::vector<std::vector<std::string>> rows{{"名次", "片号", "片名", "得分", "评价人数"}};
    std::size_t rank = 1;
    for (const auto& entry : ranking) {
        std::ostringstream average;
        average << std::fixed << std::setprecision(2) << entry.average;
        rows.push_back({std::to_string(rank++), std::to_string(entry.documentaryId),
                        tableTitle(entry.title), average.str(), std::to_string(entry.reviewCount)});
    }
    std::cout << '\n' << title << '\n';
    printAlignedTable(rows);
}

bool showCategoryRanking(const DocumentaryCatalog& catalog, const Reviews& reviews)
{
    int category = 0;
    if (!readInteger("分类榜（1. 内容  2. 画面  3. 讲解  0. 返回）：", category)) {
        return false;
    }
    switch (category) {
    case 0: break;
    case 1:
        showRanking(catalog, reviews, "内容分排行榜",
                    [](const Review& review) -> long double { return review.content; });
        break;
    case 2:
        showRanking(catalog, reviews, "画面分排行榜",
                    [](const Review& review) -> long double { return review.image; });
        break;
    case 3:
        showRanking(catalog, reviews, "讲解分排行榜",
                    [](const Review& review) -> long double { return review.narration; });
        break;
    default:
        std::cout << "请输入 0 到 3 的选项。\n";
        break;
    }
    return true;
}

bool showScoreDistribution(const DocumentaryCatalog& catalog, const Reviews& reviews)
{
    if (catalog.all().empty()) {
        std::cout << "暂无片目。\n";
        return true;
    }

    std::string line;
    if (!readLine("输入 1 到 5 之间递增的分界点，用空格分隔（例如 3 4），输入 0 返回：", line)) {
        return false;
    }
    std::istringstream input(line);
    std::vector<long double> cutoffs;
    std::vector<std::string> labels{"1"};
    long double previous = 1;
    for (std::string label; input >> label;) {
        if (label == "0" && cutoffs.empty() && (input >> std::ws).eof()) {
            return true;
        }
        std::istringstream number(label);
        long double cutoff = 0;
        if (!(number >> cutoff) || !number.eof() || !(previous < cutoff && cutoff < 5)) {
            throw std::invalid_argument("分界点必须严格递增，且大于 1、小于 5。");
        }
        cutoffs.push_back(cutoff);
        labels.push_back(label);
        previous = cutoff;
    }
    if (cutoffs.empty()) {
        throw std::invalid_argument("请输入至少一个分界点。");
    }
    labels.push_back("5");

    const auto distribution = countScoresByBand(reviews, cutoffs);
    const std::vector<std::size_t> emptyCounts(cutoffs.size() + 1);
    std::vector<std::vector<std::string>> rows{{"片号", "片名"}};
    for (std::size_t i = 1; i < labels.size(); ++i) {
        rows.front().push_back("[" + labels[i - 1] + ", " + labels[i]
                               + (i + 1 == labels.size() ? ']' : ')'));
    }
    for (const auto& documentary : catalog.all()) {
        const auto row = distribution.find(documentary.id);
        const auto& counts = row == distribution.end() ? emptyCounts : row->second;
        rows.push_back({std::to_string(documentary.id), tableTitle(documentary.title)});
        for (const auto count : counts) {
            rows.back().push_back(std::to_string(count));
        }
    }
    std::cout << "\n评分分布（按每条评价的综合分）\n";
    printAlignedTable(rows);
    return true;
}

bool login()
{
    for (int attempt = 0; attempt < 3; ++attempt) {
        std::string account;
        std::string password;
        if (!readLine("管理员账号：", account) || !readPassword(password)) {
            return false;
        }
        if (account == "admin" && password == "admin123") {
            return true;
        }
        std::cout << "账号或密码错误。\n";
    }
    std::cout << "已连续输错 3 次，返回首页。\n";
    return false;
}

template <typename HandleChoice>
void runMenu(const char* menu, HandleChoice handleChoice)
{
    for (;;) {
        std::cout << menu;
        try {
            int choice = 0;
            if (!readInteger("请选择：", choice) || choice == 0) {
                return;
            }
            if (!handleChoice(choice)) {
                return;
            }
        } catch (const ReviewCleanupRequired&) {
            throw;
        } catch (const std::exception& error) {
            std::cout << error.what() << '\n';
        }
    }
}

void showAdminMenu(DocumentaryCatalog& catalog, Reviews& reviews)
{
    runMenu("\n管理员菜单\n1. 新增片目\n2. 查看全部片目\n3. 按片名查询\n"
            "4. 修改片目\n5. 删除片目\n6. 查看全部评价\n7. 自定义分数段统计\n0. 返回首页\n",
            [&](int choice) {
        switch (choice) {
        case 1: return editDocumentary(catalog, true);
        case 2: showDocumentaries(catalog); break;
        case 3: return searchByTitle(catalog, reviews);
        case 4: return editDocumentary(catalog, false);
        case 5: return deleteDocumentary(catalog, reviews);
        case 6: showAllReviews(catalog, reviews); break;
        case 7: return showScoreDistribution(catalog, reviews);
        default: std::cout << "请输入菜单中列出的选项。\n"; break;
        }
        return true;
    });
}

void showViewerMenu(const DocumentaryCatalog& catalog, Reviews& reviews)
{
    runMenu("\n观众菜单\n1. 按片名查询及查看评价\n2. 评分或复评\n3. 查看推荐榜\n"
            "4. 查看分类榜\n0. 返回首页\n",
            [&](int choice) {
        switch (choice) {
        case 1: return searchByTitle(catalog, reviews);
        case 2: return submitReview(catalog, reviews);
        case 3: showRanking(catalog, reviews); break;
        case 4: return showCategoryRanking(catalog, reviews);
        default: std::cout << "请输入菜单中列出的选项。\n"; break;
        }
        return true;
    });
}

}  // namespace

int main(int argc, char** argv)
{
    try {
        const auto options = launchOptions(argc, argv);
        DataDirectoryLock directoryLock(options.directory);
        initializeStore(options);
        if (options.stdio) return runCoreService(options);
#ifdef _WIN32
        SetConsoleOutputCP(CP_UTF8);
        if (isConsoleInput()) _setmode(_fileno(stdin), _O_U16TEXT);
#else
        std::setlocale(LC_CTYPE, "");
#endif
        DocumentaryCatalog catalog(options.directory / "documentaries.txt");
        Reviews reviews(options.directory / "reviews.txt");
        catalog.load();
        const auto cleaned = reviews.load(catalog);
        if (cleaned > 0) std::cout << "恢复提示：已清理 " << cleaned << " 条关联片目不存在的评价。\n";
        runMenu("\n纪录片放映周 · 首页\n1. 管理员\n2. 观众\n0. 退出\n", [&](int choice) {
            switch (choice) {
            case 1:
                if (login()) showAdminMenu(catalog, reviews);
                break;
            case 2: showViewerMenu(catalog, reviews); break;
            default: std::cout << "请输入菜单中列出的选项。\n"; break;
            }
            return true;
        });
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
