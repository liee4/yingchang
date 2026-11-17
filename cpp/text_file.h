#pragma once

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

inline bool readQuotedText(std::istream& input, std::string& text)
{
    input >> std::ws;
    return input.peek() == '"' && static_cast<bool>(input >> std::quoted(text));
}

// UTF-8 whitespace matching JavaScript String.trim(), including full-width spaces.
inline std::string trimText(std::string_view text)
{
    static constexpr std::string_view whitespace[] = {
        " ", "\t", "\r", "\n", "\f", "\v", "\xC2\xA0", "\xE1\x9A\x80",
        "\xE2\x80\x80", "\xE2\x80\x81", "\xE2\x80\x82", "\xE2\x80\x83",
        "\xE2\x80\x84", "\xE2\x80\x85", "\xE2\x80\x86", "\xE2\x80\x87",
        "\xE2\x80\x88", "\xE2\x80\x89", "\xE2\x80\x8A", "\xE2\x80\xA8",
        "\xE2\x80\xA9", "\xE2\x80\xAF", "\xE2\x81\x9F", "\xE3\x80\x80", "\xEF\xBB\xBF"
    };
    bool changed;
    do {
        changed = false;
        for (const auto space : whitespace) {
            if (text.size() >= space.size() && text.substr(0, space.size()) == space) {
                text.remove_prefix(space.size());
                changed = true;
            }
            if (text.size() >= space.size() && text.substr(text.size() - space.size()) == space) {
                text.remove_suffix(space.size());
                changed = true;
            }
        }
    } while (changed);
    return std::string(text);
}

inline bool isBlank(const std::string& text)
{
    return trimText(text).empty();
}

template <typename Record, typename Read>
std::vector<Record> loadRecords(const std::filesystem::path& path, Read read)
{
    if (!std::filesystem::exists(path)) {
        return {};
    }
    std::ifstream input(path);
    if (!std::filesystem::is_regular_file(path) || !input) {
        throw std::runtime_error("无法打开数据文件 " + path.u8string());
    }

    std::vector<Record> records;
    std::string line;
    std::size_t number = 0;
    while (std::getline(input, line)) {
        if (number == 0 && line.compare(0, 3, "\xEF\xBB\xBF") == 0) {
            line.erase(0, 3);
        }
        if (!read(line, records)) {
            throw std::runtime_error(path.u8string() + " 第 " + std::to_string(number + 1)
                                     + " 行的数据格式有误或编号重复。");
        }
        ++number;
    }
    if (input.bad() || !input.eof()) {
        throw std::runtime_error("读取数据文件失败：" + path.u8string());
    }
    return records;
}

// 完整写入临时文件后才替换原文件。跨文件删除可以先写好评价文件。
class PendingTextFile {
public:
    template <typename Record, typename Write>
    PendingTextFile(const std::filesystem::path& path, const std::vector<Record>& records, Write write)
        : path_(path), temporary_(path)
    {
        temporary_ += ".tmp";
        std::ofstream output(temporary_);
        if (!output) {
            throw std::runtime_error("保存失败，无法创建临时文件：" + path_.u8string());
        }
        for (const auto& record : records) {
            write(output, record);
        }
        output.close();
        if (!output) {
            cleanUp();
            throw std::runtime_error("保存失败，无法写入：" + path_.u8string());
        }
    }

    PendingTextFile(const PendingTextFile&) = delete;
    PendingTextFile& operator=(const PendingTextFile&) = delete;
    ~PendingTextFile() { cleanUp(); }

    void commit()
    {
        std::error_code error;
        std::filesystem::rename(temporary_, path_, error);
        if (error) {
            throw std::runtime_error("保存失败，原数据未替换：" + path_.u8string()
                                     + "（" + error.message() + "）");
        }
        temporary_.clear();
    }

private:
    void cleanUp() const
    {
        if (!temporary_.empty()) {
            std::error_code error;
            std::filesystem::remove(temporary_, error);
        }
    }

    std::filesystem::path path_;
    std::filesystem::path temporary_;
};
