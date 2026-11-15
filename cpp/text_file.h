#pragma once

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <string>
#include <vector>

inline bool readQuotedText(std::istream& input, std::string& text)
{
    input >> std::ws;
    return input.peek() == '"' && static_cast<bool>(input >> std::quoted(text));
}

inline bool isBlank(const std::string& text)
{
    return text.find_first_not_of(" \t\r\n\f\v") == std::string::npos;
}

template <typename Record, typename Read>
std::vector<Record> loadRecords(const std::filesystem::path& path, Read read)
{
    if (!std::filesystem::exists(path)) {
        return {};
    }
    std::ifstream input(path);
    if (!std::filesystem::is_regular_file(path) || !input) {
        throw std::runtime_error("无法打开数据文件 " + path.string());
    }

    std::vector<Record> records;
    std::string line;
    std::size_t number = 0;
    while (std::getline(input, line)) {
        if (!read(line, records)) {
            throw std::runtime_error(path.string() + " 第 " + std::to_string(number + 1)
                                     + " 行的数据格式有误或编号重复。");
        }
        ++number;
    }
    if (input.bad() || !input.eof()) {
        throw std::runtime_error("读取数据文件失败：" + path.string());
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
            throw std::runtime_error("保存失败，无法创建临时文件：" + path_.string());
        }
        for (const auto& record : records) {
            write(output, record);
        }
        output.close();
        if (!output) {
            cleanUp();
            throw std::runtime_error("保存失败，无法写入：" + path_.string());
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
            throw std::runtime_error("保存失败，无法替换：" + path_.string());
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
