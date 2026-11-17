#include "reviews.h"
#include "text_file.h"
#include "record_codec.h"

#include <algorithm>
#include <sstream>
#include <unordered_map>
#include <utility>

namespace {

constexpr int contentScoreWeight = 2;

auto findReview(const std::vector<Review>& reviews, const Review& target)
{
    return std::find_if(reviews.begin(), reviews.end(), [&target](const Review& review) {
        return review.documentaryId == target.documentaryId && review.viewerId == target.viewerId;
    });
}

bool hasValidScores(const Review& review)
{
    return isValidScore(review.content) && isValidScore(review.image) && isValidScore(review.narration);
}

bool readReview(const std::string& line, std::vector<Review>& reviews)
{
    const auto trimmed = trimText(line);
    if (!trimmed.empty() && trimmed.front() == '{') {
        try {
            auto review = reviewFromJson(Json::parse(line));
            if (findReview(reviews, review) != reviews.end()) return false;
            reviews.push_back(std::move(review));
            return true;
        } catch (const std::exception&) { return false; }
    }
    Review review;
    std::istringstream input(line);
    if (!(input >> review.documentaryId >> review.content >> review.image >> review.narration)
        || !readQuotedText(input, review.viewerId) || !readQuotedText(input, review.comment)) {
        return false;
    }
    review.viewerId = trimText(review.viewerId);
    input >> std::ws;
    if (!input.eof() || isBlank(review.viewerId) || !hasValidScores(review)
        || findReview(reviews, review) != reviews.end()) {
        return false;
    }
    try { reviews.push_back(normalizeReview(review)); }
    catch (const std::exception&) { return false; }
    return true;
}

void writeReview(std::ostream& output, const Review& review)
{
    output << reviewToJson(review).dump() << '\n';
}

bool ranksBefore(const RankingEntry& left, const RankingEntry& right)
{
    if (left.average != right.average) {
        return left.average > right.average;
    }
    if (left.reviewCount != right.reviewCount) {
        return left.reviewCount > right.reviewCount;
    }
    return left.documentaryId < right.documentaryId;
}

struct ScoreTotal {
    long double sum = 0;
    std::size_t count = 0;
};

}  // namespace

Reviews::Reviews(std::filesystem::path path, bool persistChanges)
    : path_(std::move(path)), persistChanges_(persistChanges)
{
}

std::size_t Reviews::load(const DocumentaryCatalog& catalog)
{
    auto loaded = loadRecords<Review>(path_, readReview);
    if (!loaded.empty() && !catalog.dataFileExists()) {
        throw std::runtime_error("片目数据文件缺失，已保留评价文件。请恢复片目文件后重启。");
    }
    const auto originalCount = loaded.size();
    const auto orphaned = std::remove_if(loaded.begin(), loaded.end(), [&catalog](const Review& review) {
        return !catalog.findById(review.documentaryId);
    });
    if (orphaned != loaded.end()) {
        if (!persistChanges_) throw std::runtime_error("评价关联的片目不存在，原文件已保留。");
        loaded.erase(orphaned, loaded.end());
        PendingTextFile file(path_, loaded, writeReview);
        file.commit();
    }
    reviews_.swap(loaded);
    return originalCount - reviews_.size();
}

void Reviews::submit(const Review& input, const DocumentaryCatalog& catalog)
{
    Review review = normalizeReview(input);
    if (!catalog.findById(review.documentaryId)) {
        throw std::invalid_argument("找不到片目编号。");
    }
    if (isBlank(review.viewerId) || !hasValidScores(review)) {
        throw std::invalid_argument("请输入观众编号和 1 到 5 的整数评分。");
    }

    const auto previous = findReview(reviews_, review);
    auto updated = reviews_;
    if (previous == reviews_.end()) {
        updated.push_back(review);
    } else {
        *(updated.begin() + (previous - reviews_.cbegin())) = review;
    }
    if (persistChanges_) {
        PendingTextFile file(path_, updated, writeReview);
        file.commit();
    }
    reviews_.swap(updated);
}

void Reviews::removeDocumentary(int id, DocumentaryCatalog& catalog)
{
    auto updated = reviews_;
    const auto related = std::remove_if(updated.begin(), updated.end(), [id](const Review& review) {
        return review.documentaryId == id;
    });
    if (related == updated.end()) {
        catalog.remove(id);
        return;
    }
    updated.erase(related, updated.end());
    if (!persistChanges_) {
        catalog.remove(id);
        reviews_.swap(updated);
        return;
    }
    PendingTextFile file(path_, updated, writeReview);
    catalog.remove(id);
    reviews_.swap(updated);
    try {
        file.commit();
    } catch (const std::exception&) {
        // 片目已删除。重启时按片目编号清理磁盘上的残留评价。
        throw ReviewCleanupRequired("片目已删除，评价文件保存失败，重启后将再次清理。");
    }
}

const std::vector<Review>& Reviews::all() const
{
    return reviews_;
}

bool isValidScore(int score)
{
    return score >= 1 && score <= 5;
}

long double reviewScore(const Review& review)
{
    return (contentScoreWeight * review.content + review.image + review.narration)
           / static_cast<long double>(contentScoreWeight + 2);
}

std::string scoreFormula()
{
    return "（" + std::to_string(contentScoreWeight) + " × 内容分 + 画面分 + 讲解分）÷ "
           + std::to_string(contentScoreWeight + 2);
}

std::vector<RankingEntry> buildRanking(const DocumentaryCatalog& catalog, const Reviews& reviews,
                                       ScoreFunction score)
{
    std::unordered_map<int, ScoreTotal> totals;
    for (const auto& review : reviews.all()) {
        auto& total = totals[review.documentaryId];
        total.sum += score(review);
        ++total.count;
    }

    std::vector<RankingEntry> ranking;
    for (const auto& documentary : catalog.all()) {
        const auto total = totals.find(documentary.id);
        if (total != totals.end()) {
            const auto& scores = total->second;
            ranking.push_back({documentary.id, documentary.title, scores.sum / scores.count, scores.count});
        }
    }
    std::sort(ranking.begin(), ranking.end(), ranksBefore);
    if (ranking.size() > 10) {
        ranking.resize(10);
    }
    return ranking;
}

ScoreDistribution countScoresByBand(const Reviews& reviews, const std::vector<long double>& cutoffs)
{
    ScoreDistribution distribution;
    for (const auto& review : reviews.all()) {
        // 分数等于分界点时计入右侧区间，最高分 5 计入最后一段。
        const auto upperCutoff = std::upper_bound(cutoffs.begin(), cutoffs.end(), reviewScore(review));
        const auto band = static_cast<std::size_t>(upperCutoff - cutoffs.begin());
        auto& counts = distribution.try_emplace(review.documentaryId, cutoffs.size() + 1).first->second;
        ++counts[band];
    }
    return distribution;
}
