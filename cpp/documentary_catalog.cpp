#include "documentary_catalog.h"
#include "text_file.h"
#include "record_codec.h"

#include <algorithm>
#include <sstream>
#include <utility>

namespace {

auto findDocumentary(const std::vector<Documentary>& documentaries, int id)
{
    return std::find_if(documentaries.begin(), documentaries.end(),
                        [id](const Documentary& documentary) { return documentary.id == id; });
}

bool readDocumentary(const std::string& line, std::vector<Documentary>& records)
{
    const auto trimmed = trimText(line);
    if (!trimmed.empty() && trimmed.front() == '{') {
        try {
            auto documentary = documentaryFromJson(Json::parse(line));
            if (findDocumentary(records, documentary.id) != records.end()) return false;
            records.push_back(std::move(documentary));
            return true;
        } catch (const std::exception&) { return false; }
    }
    Documentary documentary;
    std::istringstream input(line);
    if (!(input >> documentary.id >> documentary.episodeCount)
        || !readQuotedText(input, documentary.title)
        || !readQuotedText(input, documentary.category)
        || !readQuotedText(input, documentary.director)
        || !readQuotedText(input, documentary.crew)
        || !readQuotedText(input, documentary.synopsis)) {
        return false;
    }
    input >> std::ws;
    if (!input.eof() || isBlank(documentary.title) || documentary.episodeCount <= 0
        || findDocumentary(records, documentary.id) != records.end()) {
        return false;
    }
    try { records.push_back(normalizeDocumentary(documentary)); }
    catch (const std::exception&) { return false; }
    return true;
}

void writeDocumentary(std::ostream& output, const Documentary& documentary)
{
    output << documentaryToJson(documentary).dump() << '\n';
}

}  // namespace

DocumentaryCatalog::DocumentaryCatalog(std::filesystem::path filePath, bool persistChanges)
    : filePath_(std::move(filePath)), persistChanges_(persistChanges)
{
}

void DocumentaryCatalog::load()
{
    documentaries_ = loadRecords<Documentary>(filePath_, readDocumentary);
}

void DocumentaryCatalog::add(const Documentary& input)
{
    const auto documentary = normalizeDocumentary(input);
    if (findById(documentary.id)) {
        throw std::invalid_argument("该编号已存在。");
    }
    auto updated = documentaries_;
    updated.push_back(documentary);
    save(std::move(updated));
}

void DocumentaryCatalog::update(const Documentary& input)
{
    const auto documentary = normalizeDocumentary(input);
    const auto position = findDocumentary(documentaries_, documentary.id);
    if (position == documentaries_.end()) {
        throw std::invalid_argument("找不到片目编号。");
    }
    auto updated = documentaries_;
    *(updated.begin() + (position - documentaries_.cbegin())) = documentary;
    save(std::move(updated));
}

void DocumentaryCatalog::remove(int id)
{
    const auto position = findDocumentary(documentaries_, id);
    if (position == documentaries_.end()) {
        throw std::invalid_argument("找不到片目编号。");
    }
    auto updated = documentaries_;
    updated.erase(updated.begin() + (position - documentaries_.cbegin()));
    save(std::move(updated));
}

const Documentary* DocumentaryCatalog::findById(int id) const
{
    const auto position = findDocumentary(documentaries_, id);
    return position == documentaries_.end() ? nullptr : &*position;
}

const std::vector<Documentary>& DocumentaryCatalog::all() const
{
    return documentaries_;
}

bool DocumentaryCatalog::dataFileExists() const
{
    return std::filesystem::exists(filePath_);
}

void DocumentaryCatalog::save(std::vector<Documentary> documentaries)
{
    if (persistChanges_) {
        PendingTextFile file(filePath_, documentaries, writeDocumentary);
        file.commit();
    }
    documentaries_.swap(documentaries);
}
