#include "documentary_catalog.h"
#include "reviews.h"
#include "text_file.h"

#include <cmath>
#include <fstream>
#include <functional>
#include <iostream>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace fs = std::filesystem;

void check(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

void rejects(const std::function<void()>& action)
{
    bool rejected = false;
    try { action(); } catch (const std::exception&) { rejected = true; }
    check(rejected, "invalid operation must fail");
}

std::string contents(const fs::path& path)
{
    std::ifstream input(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

Documentary film(int id)
{
    return {id, "同名纪录片", "自然", "导演", "主创", 1, "包含引号\"与反斜线\\的简介"};
}

int main(int argc, char** argv)
{
    try {
        check(argc == 2, "pass an empty test directory");
        const fs::path root(argv[1]);
        fs::create_directories(root);
        DocumentaryCatalog catalog(root / "documentaries.txt");
        Reviews reviews(root / "reviews.txt");
        catalog.load();
        reviews.load(catalog);
        for (int id : {1, 2, 5, 8}) catalog.add(film(id));
        rejects([&] { catalog.add(film(2)); });
        rejects([&] { catalog.update(film(99)); });
        auto invalidFilm = film(99);
        invalidFilm.episodeCount = 0;
        rejects([&] { catalog.add(invalidFilm); });
        invalidFilm = film(99);
        invalidFilm.title = "   ";
        rejects([&] { catalog.add(invalidFilm); });
        std::cout << "PASS catalog validation and repeated saves\n";

        reviews.submit({2, "U1", 5, 4, 3, "旧评价"}, catalog);
        check(reviewScore(reviews.all().front()) == 4.25L, "initial weighted score");
        reviews.submit({2, " \tU1\t ", 5, 4, 5, "新评价"}, catalog);
        reviews.submit({2, "　U1　", 5, 4, 5, "新评价"}, catalog);
        check(reviews.all().size() == 1, "trimmed viewer must replace previous review");
        check(reviewScore(reviews.all().front()) == 4.75L, "updated weighted score");
        for (int score : {0, 6}) {
            const auto before = contents(root / "reviews.txt");
            rejects([&] { reviews.submit({2, "U1", score, 4, 5, "无效"}, catalog); });
            check(contents(root / "reviews.txt") == before, "invalid rescore must preserve disk");
            check(reviewScore(reviews.all().front()) == 4.75L, "invalid rescore must preserve memory");
        }
        rejects([&] { reviews.submit({99, "U1", 4, 4, 4, ""}, catalog); });
        rejects([&] { reviews.submit({2, "\t ", 4, 4, 4, ""}, catalog); });
        std::cout << "PASS rescore formula, normalization and invalid-input protection\n";

        reviews.submit({2, "U1", 4, 4, 4, ""}, catalog);
        for (int id : {5, 8}) {
            for (const auto* viewer : {"U1", "U2", "U3"})
                reviews.submit({id, viewer, 4, 4, 4, ""}, catalog);
        }
        const auto ranking = buildRanking(catalog, reviews);
        check(ranking.size() == 3, "unrated film must not be ranked");
        check(ranking[0].documentaryId == 5 && ranking[1].documentaryId == 8
              && ranking[2].documentaryId == 2, "rank by score, count, id");
        auto renamed = film(5);
        renamed.title = "更名后的纪录片";
        catalog.update(renamed);
        check(buildRanking(catalog, reviews)[0].title == renamed.title, "rename retains reviews");
        const auto bands = countScoresByBand(reviews, {3, 4});
        check(bands.at(5) == std::vector<std::size_t>({0, 0, 3}), "cutoff belongs to next band");
        std::cout << "PASS ranking ties, unrated exclusion, rename and bands\n";

        const auto beforeFailure = contents(root / "reviews.txt");
        fs::create_directory(root / "reviews.txt.tmp");
        rejects([&] { reviews.submit({2, "U1", 5, 5, 5, ""}, catalog); });
        check(contents(root / "reviews.txt") == beforeFailure, "save failure preserves original file");
        check(buildRanking(catalog, reviews)[0].documentaryId == 5, "save failure preserves memory");
        rejects([&] { reviews.removeDocumentary(5, catalog); });
        check(catalog.findById(5) != nullptr, "failed delete preparation preserves film");
        fs::remove(root / "reviews.txt.tmp");
        reviews.removeDocumentary(5, catalog);
        check(catalog.findById(5) == nullptr && reviews.all().size() == 4, "cascade delete only related reviews");
        rejects([&] { reviews.removeDocumentary(99, catalog); });
        DocumentaryCatalog restarted(root / "documentaries.txt");
        Reviews restored(root / "reviews.txt");
        restarted.load();
        restored.load(restarted);
        check(restored.all().size() == 4 && restarted.all().size() == 3, "restart restores records");
        check(restarted.findById(2)->synopsis == film(2).synopsis, "quoted text roundtrip");
        std::cout << "PASS save failure, cascade delete and restart recovery\n";

        const auto goodReviews = contents(root / "reviews.txt");
        std::ofstream(root / "reviews.txt", std::ios::app) << "2 6 4 4 \"U9\" \"bad\"\n";
        const auto damaged = contents(root / "reviews.txt");
        rejects([&] { restored.load(restarted); });
        check(contents(root / "reviews.txt") == damaged && restored.all().size() == 4,
              "bad file is preserved and existing state is unchanged");
        std::ofstream(root / "reviews.txt", std::ios::binary | std::ios::trunc) << goodReviews;
        std::ofstream(root / "reviews.txt", std::ios::app) << "2 4 4 4 \" U1 \" \"duplicate\"\n";
        rejects([&] { restored.load(restarted); });
        std::cout << "PASS malformed file and normalized duplicate detection\n";

        // A missing catalog must never cause the remaining review file to be cleared.
        DocumentaryCatalog missing(root / "missing.txt");
        missing.load();
        std::ofstream(root / "reviews.txt", std::ios::binary | std::ios::trunc) << goodReviews;
        Reviews protectedReviews(root / "reviews.txt");
        rejects([&] { protectedReviews.load(missing); });
        check(contents(root / "reviews.txt") == goodReviews, "missing catalog preserves reviews");
        const auto validCatalog = contents(root / "documentaries.txt");
        std::ofstream(root / "documentaries.txt", std::ios::binary | std::ios::trunc)
            << "\xEF\xBB\xBF" << validCatalog;
        restarted.load();
        restored.load(restarted);
        check(restarted.all().size() == 3, "UTF-8 BOM is accepted");
        std::ofstream(root / "documentaries.txt", std::ios::binary | std::ios::app) << validCatalog;
        const auto duplicateCatalog = contents(root / "documentaries.txt");
        rejects([&] { restarted.load(); });
        check(contents(root / "documentaries.txt") == duplicateCatalog, "duplicate catalog is not overwritten");
        std::cout << "PASS missing catalog protection, BOM and duplicate film detection\n";

        fs::create_directories(root / "ranking");
        DocumentaryCatalog many(root / "ranking/documentaries.txt");
        Reviews manyReviews(root / "ranking/reviews.txt");
        for (int id = 0; id < 12; ++id) {
            many.add(film(id));
            manyReviews.submit({id, "U1", 4, 4, 4, ""}, many);
        }
        check(buildRanking(many, manyReviews).size() == 10, "ranking is limited to ten");
        manyReviews.submit({11, "U1", 5, 5, 5, ""}, many);
        check(buildRanking(many, manyReviews)[0].documentaryId == 11, "higher score wins");
        check(countScoresByBand(manyReviews, {3, 4}).at(11)[2] == 1, "five belongs to last band");
        std::cout << "PASS top ten and maximum score boundary\n";

#ifdef _WIN32
        // Deny replacement of the target file to exercise failure after staging succeeds.
        fs::create_directories(root / "recovery");
        DocumentaryCatalog recoveryCatalog(root / "recovery/documentaries.txt");
        Reviews recoveryReviews(root / "recovery/reviews.txt");
        recoveryCatalog.add(film(1));
        recoveryCatalog.add(film(2));
        recoveryReviews.submit({1, "U1", 4, 4, 4, ""}, recoveryCatalog);
        recoveryReviews.submit({2, "U1", 4, 4, 4, ""}, recoveryCatalog);
        const auto lockedPath = root / "recovery/reviews.txt";
        struct FileLock {
            HANDLE handle;
            ~FileLock() { CloseHandle(handle); }
        };
        const auto beforeLockedSave = contents(lockedPath);
        {
            FileLock lock{CreateFileW(lockedPath.c_str(), GENERIC_READ, FILE_SHARE_READ,
                                     nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr)};
            check(lock.handle != INVALID_HANDLE_VALUE, "lock review file");
            rejects([&] { recoveryReviews.submit({1, "U1", 5, 5, 5, ""}, recoveryCatalog); });
            check(contents(lockedPath) == beforeLockedSave, "failed replacement preserves disk");
            check(recoveryReviews.all()[0].content == 4, "failed replacement preserves memory");
            bool cleanupRequired = false;
            try { recoveryReviews.removeDocumentary(1, recoveryCatalog); }
            catch (const ReviewCleanupRequired&) { cleanupRequired = true; }
            check(cleanupRequired, "interrupted cascade reports cleanup requirement");
        }
        DocumentaryCatalog recoveredCatalog(root / "recovery/documentaries.txt");
        Reviews recoveredReviews(lockedPath);
        recoveredCatalog.load();
        check(recoveredReviews.load(recoveredCatalog) == 1, "restart recovers interrupted delete");
        check(recoveredReviews.all().size() == 1 && recoveredReviews.all()[0].documentaryId == 2,
              "recovery only removes deleted film reviews");
        std::cout << "PASS Windows target lock, failed replacement and interrupted-delete recovery\n";
#endif
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
}
