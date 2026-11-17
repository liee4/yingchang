#pragma once

#include <filesystem>
#include <string>
#include <vector>

struct SourceLink {
    std::string label;
    std::string url;
};

struct FilmDetails {
    int year = 0;
    int posterId = 0;
    std::string originalTitle{};
    std::string region{};
    std::string language{};
    std::string duration{};
    std::string tagline{};
    std::string artworkKind{};
    std::vector<std::string> highlights{};
    std::vector<std::string> chapters{};
    std::vector<std::string> styles{};
    std::vector<SourceLink> sources{};
    bool isDemoFilm = false;
};

struct Documentary {
    int id = 0;
    std::string title;
    std::string category;
    std::string director;
    std::string crew;
    int episodeCount = 0;
    std::string synopsis;
    FilmDetails details{};
};

class DocumentaryCatalog {
public:
    explicit DocumentaryCatalog(std::filesystem::path filePath, bool persistChanges = true);

    void load();
    void add(const Documentary& documentary);
    void update(const Documentary& documentary);
    void remove(int id);
    const Documentary* findById(int id) const;
    const std::vector<Documentary>& all() const;
    bool dataFileExists() const;

private:
    void save(std::vector<Documentary> documentaries);

    std::filesystem::path filePath_;
    std::vector<Documentary> documentaries_;
    bool persistChanges_;
};
