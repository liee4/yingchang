#pragma once

#include "record_codec.h"
#include <stdexcept>

struct StoreOptions {
    std::filesystem::path directory;
    std::filesystem::path seedFile;
    std::filesystem::path legacyWebFile;
    std::filesystem::path legacyCppDirectory;
    bool stdio = false;
};

class DataDirectoryLock {
public:
    explicit DataDirectoryLock(const std::filesystem::path& directory);
    ~DataDirectoryLock();
    DataDirectoryLock(const DataDirectoryLock&) = delete;
    DataDirectoryLock& operator=(const DataDirectoryLock&) = delete;
private:
#ifdef _WIN32
    void* handle_ = nullptr;
#else
    int handle_ = -1;
#endif
};

class StoreRecoveryRequired : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

StoreOptions launchOptions(int argc, char** argv);
void initializeStore(const StoreOptions& options);
void recoverStore(const std::filesystem::path& directory);
void saveDataset(const std::filesystem::path& directory, const std::vector<Documentary>& films,
                 const std::vector<Review>& reviews);
