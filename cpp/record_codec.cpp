#include "record_codec.h"
#include "text_file.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <sstream>

namespace {

std::size_t textLength(const std::string& text)
{
    std::size_t length = 0;
    for (const unsigned char c : text) {
        if ((c & 0xC0) != 0x80) length += c >= 0xF0 ? 2 : 1;
    }
    return length;
}

std::string textField(const Json& value, const char* field, std::size_t limit, bool optional = false)
{
    if (optional && !value.contains(field)) return {};
    if (!value.contains(field) || !value[field].is_string()) {
        throw std::invalid_argument(std::string("文字字段无效：") + field);
    }
    auto text = trimText(value[field].get<std::string>());
    if (textLength(text) > limit) throw std::invalid_argument(std::string("文字过长：") + field);
    // dump checks UTF-8 as well, including strings originating from the terminal.
    Json(text).dump();
    return text;
}

std::vector<std::string> textList(const Json& value, const char* field, std::size_t maxItems)
{
    if (!value.contains(field)) return {};
    if (!value[field].is_array() || value[field].size() > maxItems) {
        throw std::invalid_argument(std::string("列表格式无效：") + field);
    }
    std::vector<std::string> result;
    for (const auto& item : value[field]) {
        const auto text = textField(Json{{"text", item}}, "text", 180);
        if (text.empty()) throw std::invalid_argument("列表项目不能为空。");
        result.push_back(text);
    }
    return result;
}

bool optionalFlag(const Json& value, const char* field)
{
    if (!value.contains(field)) return false;
    if (!value[field].is_boolean()) throw std::invalid_argument(std::string("标记格式无效：") + field);
    return value[field].get<bool>();
}

} // namespace

int requiredInteger(const Json& object, const char* field)
{
    if (!object.is_object() || !object.contains(field) || !object[field].is_number_integer()) {
        throw std::invalid_argument(std::string("请输入整数：") + field);
    }
    const auto& number = object[field];
    if ((number.is_number_unsigned() && number.get<std::uint64_t>() > static_cast<std::uint64_t>(std::numeric_limits<int>::max()))
        || (!number.is_number_unsigned() && (number.get<std::int64_t>() < std::numeric_limits<int>::min()
                                             || number.get<std::int64_t>() > std::numeric_limits<int>::max()))) {
        throw std::invalid_argument(std::string("整数超出范围：") + field);
    }
    return number.get<int>();
}

std::vector<std::string> visualStylesFromJson(const Json& value)
{
    std::vector<std::string> styles;
    for (const auto& style : textList(value, "styles", 4)) {
        if (style != "风光长镜" && style != "纪实跟拍" && style != "细节特写" && style != "夜景光影") {
            throw std::invalid_argument("画面风格选项无效。");
        }
        if (std::find(styles.begin(), styles.end(), style) == styles.end()) styles.push_back(style);
    }
    return styles;
}

Documentary documentaryFromJson(const Json& value)
{
    if (!value.is_object()) throw std::invalid_argument("片目须为对象。");
    Documentary film;
    film.id = requiredInteger(value, "id");
    film.episodeCount = requiredInteger(value, "episodes");
    if (film.episodeCount <= 0) throw std::invalid_argument("集数必须为正整数。");
    film.title = textField(value, "title", 120);
    if (film.title.empty()) throw std::invalid_argument("片名不能为空。");
    film.category = textField(value, "category", 50);
    film.director = textField(value, "director", 120);
    film.crew = textField(value, "crew", 200);
    film.synopsis = textField(value, "synopsis", 1200);
    auto& details = film.details;
    if (value.contains("year") && !value["year"].is_null()) {
        details.year = requiredInteger(value, "year");
        if (details.year < 1800 || details.year > 2200) throw std::invalid_argument("年份格式无效。");
    }
    if (value.contains("posterId") && !value["posterId"].is_null()) {
        details.posterId = requiredInteger(value, "posterId");
        if (details.posterId <= 0) throw std::invalid_argument("海报编号无效。");
    }
    details.originalTitle = textField(value, "originalTitle", 120, true);
    details.region = textField(value, "region", 80, true);
    details.language = textField(value, "language", 80, true);
    details.duration = textField(value, "duration", 80, true);
    details.tagline = textField(value, "tagline", 160, true);
    details.artworkKind = textField(value, "artworkKind", 40, true);
    details.highlights = textList(value, "highlights", 6);
    details.chapters = textList(value, "chapters", 100);
    details.styles = visualStylesFromJson(value);
    details.isDemoFilm = optionalFlag(value, "isDemoFilm");
    if (value.contains("sources")) {
        if (!value["sources"].is_array() || value["sources"].size() > 4) {
            throw std::invalid_argument("资料来源格式无效。");
        }
        for (const auto& source : value["sources"]) {
            SourceLink link{textField(source, "label", 120), textField(source, "url", 2000)};
            const auto start = link.url.find("://");
            if (link.label.empty() || (start != 4 && start != 5)
                || (link.url.substr(0, start) != "http" && link.url.substr(0, start) != "https")
                || link.url.size() <= start + 3 || link.url[start + 3] == '/'
                || link.url.find_first_of(" \t\r\n") != std::string::npos) {
                throw std::invalid_argument("资料来源链接须为有效的网页地址。");
            }
            details.sources.push_back(std::move(link));
        }
    }
    return film;
}

Review reviewFromJson(const Json& value)
{
    if (!value.is_object()) throw std::invalid_argument("评价须为对象。");
    Review review;
    review.documentaryId = requiredInteger(value, "filmId");
    review.viewerId = textField(value, "viewerId", 32);
    review.comment = textField(value, "comment", 250);
    review.content = requiredInteger(value, "content");
    review.image = requiredInteger(value, "image");
    review.narration = requiredInteger(value, "narration");
    if (review.viewerId.empty()) throw std::invalid_argument("观众编号不能为空。");
    if (!isValidScore(review.content) || !isValidScore(review.image) || !isValidScore(review.narration)) {
        throw std::invalid_argument("三项评分都须为 1 到 5 的整数。");
    }
    review.isSample = optionalFlag(value, "isSample");
    return review;
}

Json documentaryToJson(const Documentary& film)
{
    Json value{{"id", film.id}, {"title", film.title}, {"category", film.category}, {"director", film.director},
               {"crew", film.crew}, {"episodes", film.episodeCount}, {"synopsis", film.synopsis}};
    const auto& details = film.details;
    if (details.year) value["year"] = details.year;
    if (details.posterId) value["posterId"] = details.posterId;
    for (const auto& pair : std::vector<std::pair<const char*, std::string>>{
             {"originalTitle", details.originalTitle}, {"region", details.region}, {"language", details.language},
             {"duration", details.duration}, {"tagline", details.tagline}, {"artworkKind", details.artworkKind}}) {
        if (!pair.second.empty()) value[pair.first] = pair.second;
    }
    if (!details.highlights.empty()) value["highlights"] = details.highlights;
    if (!details.chapters.empty()) value["chapters"] = details.chapters;
    if (!details.styles.empty()) value["styles"] = details.styles;
    if (!details.sources.empty()) {
        value["sources"] = Json::array();
        for (const auto& source : details.sources) value["sources"].push_back({{"label", source.label}, {"url", source.url}});
    }
    if (details.isDemoFilm) value["isDemoFilm"] = true;
    return value;
}

Json reviewToJson(const Review& review)
{
    Json value{{"filmId", review.documentaryId}, {"viewerId", review.viewerId}, {"content", review.content},
               {"image", review.image}, {"narration", review.narration}, {"comment", review.comment}};
    if (review.isSample) value["isSample"] = true;
    return value;
}

Documentary normalizeDocumentary(const Documentary& film) { return documentaryFromJson(documentaryToJson(film)); }
Review normalizeReview(const Review& review) { return reviewFromJson(reviewToJson(review)); }

std::vector<long double> parseScoreCutoffs(const Json& value)
{
    std::vector<long double> result;
    if (value.is_string()) {
        std::istringstream input(value.get<std::string>());
        std::string token;
        while (input >> token) {
            if (token.find_first_not_of("0123456789.") != std::string::npos) throw std::invalid_argument("分界点须为小数或整数。");
            std::istringstream number(token);
            long double cutoff = 0;
            if (!(number >> cutoff) || !number.eof()) throw std::invalid_argument("分界点格式无效。");
            result.push_back(cutoff);
        }
    } else if (value.is_array()) {
        for (const auto& cutoff : value) {
            if (!cutoff.is_number()) throw std::invalid_argument("分界点须为数字。");
            result.push_back(cutoff.get<long double>());
        }
    } else throw std::invalid_argument("请输入分界点。");
    if (result.empty() || result.size() > 100) throw std::invalid_argument("请输入 1 至 100 个分界点。");
    long double previous = 1;
    for (const auto cutoff : result) {
        if (!std::isfinite(cutoff) || !(previous < cutoff && cutoff < 5)) {
            throw std::invalid_argument("分界点须大于 1、小于 5，并严格递增。");
        }
        previous = cutoff;
    }
    return result;
}
