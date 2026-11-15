#pragma once

#include <filesystem>
#include <string>
#include <vector>

struct Documentary {
    int id = 0;
    std::string title;
    std::string category;
    std::string director;
    std::string crew;
    int episodeCount = 0;
    std::string synopsis;
};

class DocumentaryCatalog {
public:
    explicit DocumentaryCatalog(std::filesystem::path filePath);

    void load();
    void add(const Documentary& documentary);
    void update(const Documentary& documentary);
    void remove(int id);
    const Documentary* findById(int id) const;
    const std::vector<Documentary>& all() const;

private:
    void save(std::vector<Documentary> documentaries);

    std::filesystem::path filePath_;
    std::vector<Documentary> documentaries_;
};
