#pragma once

#include "documentary_catalog.h"

#include <cstddef>
#include <stdexcept>
#include <unordered_map>

class ReviewCleanupRequired : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

struct Review {
    int documentaryId = 0;
    std::string viewerId;
    int content = 0;
    int image = 0;
    int narration = 0;
    std::string comment;
    bool isSample = false;
};

struct RankingEntry {
    int documentaryId;
    std::string title;
    long double average;
    std::size_t reviewCount;
};

class Reviews {
public:
    explicit Reviews(std::filesystem::path path, bool persistChanges = true);
    // Return the number of orphaned reviews recovered after an interrupted delete.
    std::size_t load(const DocumentaryCatalog& catalog);
    void submit(const Review& review, const DocumentaryCatalog& catalog);
    void removeDocumentary(int id, DocumentaryCatalog& catalog);
    const std::vector<Review>& all() const;

private:
    std::filesystem::path path_;
    std::vector<Review> reviews_;
    bool persistChanges_;
};

bool isValidScore(int score);
long double reviewScore(const Review& review);
std::string scoreFormula();

using ScoreFunction = long double (*)(const Review&);
std::vector<RankingEntry> buildRanking(const DocumentaryCatalog& catalog, const Reviews& reviews,
                                       ScoreFunction score = reviewScore);

using ScoreDistribution = std::unordered_map<int, std::vector<std::size_t>>;
ScoreDistribution countScoresByBand(const Reviews& reviews, const std::vector<long double>& cutoffs);
