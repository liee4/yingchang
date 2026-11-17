#include "core_service.h"
#include "text_file.h"
#include "accounts.h"

#include <fstream>
#include <iostream>
#include <sstream>
#include <chrono>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace {

struct ServiceError : std::runtime_error {
    int status;
    ServiceError(int code, const std::string& message) : std::runtime_error(message), status(code) {}
};

long double contentScore(const Review& review) { return review.content; }
long double imageScore(const Review& review) { return review.image; }
long double narrationScore(const Review& review) { return review.narration; }

ScoreFunction metricScore(const std::string& metric)
{
    if (metric == "overall") return reviewScore;
    if (metric == "content") return contentScore;
    if (metric == "image") return imageScore;
    if (metric == "narration") return narrationScore;
    throw std::invalid_argument("未知的评分维度。");
}

std::string lowerAscii(std::string text)
{
    for (auto& c : text) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c + ('a' - 'A'));
    return text;
}

bool sameOpinion(const Review& a, const Review& b)
{
    return a.content == b.content && a.image == b.image && a.narration == b.narration && a.comment == b.comment;
}

class CoreService {
public:
    explicit CoreService(const StoreOptions& options)
        : directory_(options.directory), films_(directory_ / "documentaries.txt", false), reviews_(directory_ / "reviews.txt", false), accounts_(directory_)
    {
        films_.load();
        reviews_.load(films_);
        std::ifstream input(options.seedFile);
        if (!input || !(input >> seed_)) throw std::runtime_error("无法读取初始化资料。");
    }

    Json snapshot() const
    {
        Json films = Json::array(), reviews = Json::array(), rankings = Json::object();
        auto displayedFilms = films_.all();
        std::stable_sort(displayedFilms.begin(), displayedFilms.end(), [](const Documentary& a, const Documentary& b) {
            return !a.details.isDemoFilm && b.details.isDemoFilm;
        });
        for (const auto& film : displayedFilms) {
            auto value = documentaryToJson(film);
            std::size_t count = 0, sampleCount = 0;
            long double sum = 0, content = 0, image = 0, narration = 0;
            for (const auto& review : reviews_.all()) {
                if (review.documentaryId != film.id) continue;
                ++count;
                if (review.isSample) ++sampleCount;
                sum += reviewScore(review);
                content += review.content; image += review.image; narration += review.narration;
            }
            value["summary"] = {{"count", count}, {"sampleCount", sampleCount}, {"average", count ? Json(sum / count) : Json(nullptr)}};
            value["summary"]["dimensions"] = {{"content", count ? Json(content / count) : Json(nullptr)},
                {"image", count ? Json(image / count) : Json(nullptr)}, {"narration", count ? Json(narration / count) : Json(nullptr)}};
            films.push_back(std::move(value));
        }
        for (const auto& review : reviews_.all()) {
            auto value = reviewToJson(review);
            value["viewerName"] = accounts_.displayName(review.viewerId);
            value["overallScore"] = reviewScore(review);
            reviews.push_back(std::move(value));
        }
        for (const auto* metric : {"overall", "content", "image", "narration"}) rankings[metric] = ranking(metric);
        return {{"films", films}, {"reviews", reviews}, {"rankings", rankings}, {"scoreFormula", scoreFormula()}, {"backend", "cpp"}};
    }

    Json ranking(const std::string& metric) const
    {
        Json result = Json::array();
        for (const auto& entry : buildRanking(films_, reviews_, metricScore(metric))) {
            result.push_back({{"film", documentaryToJson(*films_.findById(entry.documentaryId))}, {"average", entry.average},
                              {"count", entry.reviewCount}});
        }
        return result;
    }

    Json dispatch(const std::string& operation, const Json& params)
    {
        if (!params.is_object()) throw std::invalid_argument("请求参数须为对象。");
        if (operation == "activity.read" || operation == "activity.update") {
            const auto viewerId = params.at("viewerId").get<std::string>();
            auto activity = accounts_.viewerActivity(viewerId);
            if (operation == "activity.update") {
                const auto before = activity;
                updateActivity(activity, params.at("change"));
                if (activity != before) accounts_.saveViewerActivity(viewerId, activity);
            }
            return activity;
        }
        if (operation.rfind("account.", 0) == 0) return accounts_.dispatch(operation, params);
        if (operation == "catalog") return snapshot();
        if (operation == "ping") return {{"engine", "cpp"}, {"protocol", 1}};
        if (operation == "backup") {
            const auto stamp = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
            const auto destination = directory_ / "backups" / ("snapshot-" + std::to_string(stamp));
            if (!std::filesystem::create_directories(destination)) throw std::runtime_error("备份目录已存在，请重试。");
            // Dispatch is sequential: films, reviews and accounts cannot change during this copy.
            for (const auto* name : {"documentaries.txt", "reviews.txt", "users.txt"}) {
                std::filesystem::copy_file(directory_ / name, destination / name);
            }
            std::ofstream manifest(destination / "manifest.json");
            manifest << Json{{"format", 1}, {"films", films_.all().size()}, {"reviews", reviews_.all().size()},
                {"files", {"documentaries.txt", "reviews.txt", "users.txt"}}}.dump(2);
            manifest.close();
            if (!manifest) throw std::runtime_error("备份清单写入失败，备份未完成。");
            return {{"directory", destination.u8string()}, {"films", films_.all().size()}, {"reviews", reviews_.all().size()}};
        }
        if (operation == "ranking") return {{"rows", ranking(params.value("metric", "overall"))}};
        if (operation == "search") {
            const auto query = lowerAscii(trimText(params.value("query", "")));
            const auto category = params.value("category", "全部");
            const auto edition = params.value("edition", "all");
            if (edition != "all" && edition != "real" && edition != "demo") throw std::invalid_argument("未知的片库范围。");
            const auto exact = params.value("exact", false);
            if (query.size() > 300) throw std::invalid_argument("搜索内容过长。");
            std::istringstream words(query);
            std::vector<std::string> tokens;
            std::string token;
            while (words >> token) tokens.push_back(token);
            std::vector<std::pair<int, int>> matches;
            Json ids = Json::array();
            for (const auto& film : films_.all()) {
                if ((edition == "real" && film.details.isDemoFilm) || (edition == "demo" && !film.details.isDemoFilm)) continue;
                const auto title = lowerAscii(film.title);
                if (!category.empty() && category != "全部" && category != film.category) continue;
                const auto primary = lowerAscii(film.title + " " + film.details.originalTitle);
                const auto metadata = lowerAscii(film.director + " " + film.crew + " " + film.category + " " + film.details.region);
                const auto all = primary + " " + metadata + " " + lowerAscii(film.synopsis);
                bool matched = !exact || title == query;
                int relevance = title == query && !query.empty() ? 100 : (query.empty() && film.details.isDemoFilm ? -1 : 0);
                for (const auto& word : tokens) {
                    const bool idMatch = std::to_string(film.id) == word;
                    if (!idMatch && all.find(word) == std::string::npos) { matched = false; break; }
                    relevance += idMatch ? 50 : primary.find(word) != std::string::npos ? 20 : metadata.find(word) != std::string::npos ? 10 : 1;
                }
                if (matched) matches.push_back({film.id, relevance});
            }
            std::stable_sort(matches.begin(), matches.end(), [](const auto& a, const auto& b) { return a.second > b.second; });
            for (const auto& match : matches) ids.push_back(match.first);
            return {{"filmIds", ids}, {"query", query}};
        }
        if (operation == "distribution") {
            const auto cutoffs = parseScoreCutoffs(params.value("cutoffs", Json("3 4")));
            const auto distribution = countScoresByBand(reviews_, cutoffs);
            Json rows = Json::array(), labels = Json::array();
            long double lower = 1;
            for (std::size_t i = 0; i <= cutoffs.size(); ++i) {
                const auto upper = i < cutoffs.size() ? cutoffs[i] : 5;
                std::ostringstream label;
                label << '[' << lower << ", " << upper << (i == cutoffs.size() ? ']' : ')');
                labels.push_back(label.str());
                lower = upper;
            }
            std::vector<std::size_t> totals(cutoffs.size() + 1);
            std::size_t total = 0, sampleCount = 0;
            for (const auto& review : reviews_.all()) if (review.isSample) ++sampleCount;
            for (const auto& film : films_.all()) {
                const auto found = distribution.find(film.id);
                const auto counts = found == distribution.end() ? std::vector<std::size_t>(cutoffs.size() + 1) : found->second;
                for (std::size_t i = 0; i < counts.size(); ++i) { totals[i] += counts[i]; total += counts[i]; }
                rows.push_back({{"filmId", film.id}, {"title", film.title}, {"counts", counts}});
            }
            Json percentages = Json::array();
            for (const auto count : totals) percentages.push_back(total ? 100.0L * count / total : 0);
            return {{"labels", labels}, {"rows", rows}, {"totals", totals}, {"total", total},
                {"percentages", percentages}, {"sampleCount", sampleCount}};
        }

        auto nextFilms = films_;
        auto nextReviews = reviews_;
        bool replaced = false;
        if (operation == "film.add") {
            const auto film = documentaryFromJson(params.at("film"));
            if (films_.findById(film.id)) throw ServiceError(409, "该片目编号已存在。");
            nextFilms.add(film);
        } else if (operation == "film.update" || operation == "film.delete") {
            const auto id = requiredInteger(params, "filmId");
            const auto* old = films_.findById(id);
            if (!old) throw ServiceError(404, "找不到该片目。");
            if (operation == "film.delete") nextReviews.removeDocumentary(id, nextFilms);
            else {
                const auto& changes = params.at("film");
                if (!changes.is_object()) throw std::invalid_argument("片目须为对象。");
                auto merged = documentaryToJson(*old);
                merged.update(changes);
                merged["id"] = id;
                nextFilms.update(documentaryFromJson(merged));
            }
        } else if (operation == "review.submit") {
            const auto& input = params.at("review");
            const auto filmId = requiredInteger(input, "filmId");
            if (!films_.findById(filmId)) throw ServiceError(404, "找不到该片目。");
            auto review = reviewFromJson(input);
            review.isSample = false;
            replaced = std::any_of(reviews_.all().begin(), reviews_.all().end(), [&](const Review& item) {
                return item.documentaryId == review.documentaryId && item.viewerId == review.viewerId;
            });
            nextReviews.submit(review, nextFilms);
        } else if (operation == "review.clearComment") {
            const auto filmId = requiredInteger(params, "filmId");
            const auto viewerId = params.at("viewerId").get<std::string>();
            const auto record = std::find_if(reviews_.all().begin(), reviews_.all().end(), [&](const Review& review) {
                return review.documentaryId == filmId && review.viewerId == viewerId;
            });
            if (record == reviews_.all().end()) throw ServiceError(404, "找不到对应的短评。");
            if (record->comment.empty()) return snapshot();
            auto review = *record;
            review.comment.clear();
            nextReviews.submit(review, nextFilms);
        } else if (operation == "reviews.import") {
            const auto& entries = params.at("reviews");
            if (!entries.is_array()) throw std::invalid_argument("旧评价格式无效。");
            bool changed = false;
            for (const auto& value : entries) {
                auto review = reviewFromJson(value);
                if (accounts_.findViewer(review.viewerId)) continue;
                review.isSample = false;
                bool isBaseline = false;
                Review baseline;
                bool hasBaseline = false;
                for (const auto* field : {"legacyReviews", "reviews"}) {
                    if (!seed_.contains(field)) continue;
                    for (const auto& item : seed_[field]) {
                        const auto sample = reviewFromJson(item);
                        if (sample.documentaryId == review.documentaryId && sample.viewerId == review.viewerId) {
                            baseline = sample; hasBaseline = true; isBaseline = sameOpinion(review, baseline);
                        }
                    }
                }
                if (!nextFilms.findById(review.documentaryId)) {
                    if (isBaseline) continue;
                    bool added = false;
                    if (seed_.contains("legacyFilms")) {
                        for (const auto& item : seed_["legacyFilms"]) {
                            auto old = documentaryFromJson(item);
                            if (old.id == review.documentaryId) {
                                old.details.isDemoFilm = true;
                                nextFilms.add(old); added = true; break;
                            }
                        }
                    }
                    if (!added) throw ServiceError(404, "旧评价关联的片目不存在，未导入。");
                }
                const auto existing = std::find_if(nextReviews.all().begin(), nextReviews.all().end(), [&](const Review& item) {
                    return item.documentaryId == review.documentaryId && item.viewerId == review.viewerId;
                });
                if (!isBaseline && (existing == nextReviews.all().end() || (hasBaseline && sameOpinion(*existing, baseline)))) {
                    nextReviews.submit(review, nextFilms);
                    changed = true;
                }
            }
            if (!changed) return snapshot();
        } else throw ServiceError(404, "核心操作不存在。");

        saveDataset(directory_, nextFilms.all(), nextReviews.all());
        films_ = std::move(nextFilms);
        reviews_ = std::move(nextReviews);
        auto result = snapshot();
        if (operation == "review.submit") result["replaced"] = replaced;
        return result;
    }
private:
    void updateActivity(Json& activity, const Json& change) const
    {
        const auto action = change.at("action").get<std::string>();
        auto& history = activity.at("history");
        auto& favorites = activity.at("favorites");
        if (action == "clearHistory") {
            history.clear();
            return;
        }
        if (action == "preferences") {
            const auto& selected = change.at("topics");
            if (!selected.is_array()) throw std::invalid_argument("影片题材须为列表。");
            Json topics = Json::array();
            for (const auto& value : selected) {
                const auto topic = value.get<std::string>();
                const auto& films = films_.all();
                if (std::any_of(films.begin(), films.end(), [&](const Documentary& film) { return film.category == topic; })
                    && std::find(topics.begin(), topics.end(), topic) == topics.end()) topics.push_back(topic);
            }
            activity["preferences"] = {{"topics", topics}, {"styles", visualStylesFromJson(change)}};
            return;
        }
        const auto filmId = requiredInteger(change, "filmId");
        if ((action == "favorite" || action == "visit") && !films_.findById(filmId)) {
            throw ServiceError(404, "找不到该片目。");
        }
        if (action == "favorite" || action == "unfavorite") {
            const auto current = std::find(favorites.begin(), favorites.end(), filmId);
            if (action == "favorite" && current == favorites.end()) favorites.push_back(filmId);
            if (action == "unfavorite" && current != favorites.end()) favorites.erase(current);
        } else if (action == "visit" || action == "removeVisit") {
            const auto current = std::find_if(history.begin(), history.end(), [&](const Json& entry) {
                return entry.at("filmId") == filmId;
            });
            if (current != history.end()) history.erase(current);
            if (action == "visit") {
                const auto now = std::chrono::system_clock::now().time_since_epoch();
                const auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
                history.insert(history.begin(), Json{{"filmId", filmId}, {"visitedAt", timestamp}});
            }
        } else throw std::invalid_argument("观众记录操作无效。");
    }

    std::filesystem::path directory_;
    DocumentaryCatalog films_;
    Reviews reviews_;
    Accounts accounts_;
    Json seed_;
};

} // namespace

int runCoreService(const StoreOptions& options)
{
    CoreService service(options);
#ifdef _WIN32
    const auto pid = GetCurrentProcessId();
#else
    const auto pid = getpid();
#endif
    std::cout << Json{{"event", "ready"}, {"engine", "cpp"}, {"protocol", 1}, {"pid", pid}, {"dataDirectory", options.directory.u8string()}}.dump() << std::endl;
    std::string line;
    while (std::getline(std::cin, line)) {
        Json id = nullptr;
        try {
            if (line.size() > 512000) throw std::invalid_argument("请求内容过长。");
            const auto request = Json::parse(line);
            id = request.at("id");
            const auto result = service.dispatch(request.at("operation").get<std::string>(), request.value("params", Json::object()));
            std::cout << Json{{"id", id}, {"ok", true}, {"result", result}}.dump() << std::endl;
        } catch (const StoreRecoveryRequired& error) {
            std::cout << Json{{"id", id}, {"ok", false}, {"status", 503}, {"error", error.what()}, {"fatal", true}}.dump() << std::endl;
            return 1;
        } catch (const ServiceError& error) {
            std::cout << Json{{"id", id}, {"ok", false}, {"status", error.status}, {"error", error.what()}}.dump() << std::endl;
        } catch (const std::invalid_argument& error) {
            std::cout << Json{{"id", id}, {"ok", false}, {"status", 400}, {"error", error.what()}}.dump() << std::endl;
        } catch (const Json::exception& error) {
            std::cout << Json{{"id", id}, {"ok", false}, {"status", 400}, {"error", "请求字段或 JSON 格式无效。"}}.dump() << std::endl;
            std::cerr << error.what() << '\n';
        } catch (const std::exception& error) {
            std::cout << Json{{"id", id}, {"ok", false}, {"status", 500}, {"error", error.what()}}.dump() << std::endl;
        }
    }
    return 0;
}
