#pragma once
#include "record_codec.h"
#include "text_file.h"
#include <chrono>
#include <regex>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

// The C++ process holds the directory lock and owns this single atomic account store.
// Password derivation and session verification belong to the Node authentication layer.
class Accounts {
    std::filesystem::path path_;
    Json data_ = {{"users", Json::array()}, {"invites", Json::array()}};
    static std::string normalized(std::string name) {
        name = trimText(name);
        for (auto& c : name) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
        return name;
    }
    static long long now() {
        return std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    }
    static void validate(const Json& user) {
        if (!std::regex_match(user.at("account").get<std::string>(), std::regex("[a-z0-9_]{3,24}")))
            throw std::invalid_argument("账号须为 3–24 位英文字母、数字或下划线。");
        const auto name = trimText(user.at("displayName").get<std::string>());
        if (name.empty() || name.size() > 72 || name.find_first_of("\r\n") != std::string::npos)
            throw std::invalid_argument("昵称须为 1–24 个汉字以内。");
        if (user.at("role") != "viewer" && user.at("role") != "admin") throw std::invalid_argument("账号类型无效。");
        for (const auto* field : {"passwordHash", "salt", "viewerId"})
            if (!std::regex_match(user.at(field).get<std::string>(), std::regex(field == std::string("passwordHash") ? "[a-f0-9]{128}" : field == std::string("salt") ? "[a-f0-9]{32}" : "V[a-f0-9]{24}")))
                throw std::invalid_argument("账号凭据格式无效。");
    }
    void save(Json next) {
        auto temporary = path_; temporary += ".tmp";
        std::ofstream out(temporary, std::ios::binary | std::ios::trunc);
        if (!out) throw std::runtime_error("账号保存失败，无法创建临时文件。");
        out << next.dump(2) << '\n'; out.close();
        if (!out) throw std::runtime_error("账号保存失败，原账号数据已保留。");
#ifdef _WIN32
        if (!MoveFileExW(temporary.c_str(), path_.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
            throw std::runtime_error("账号保存失败，无法替换账号文件。");
#else
        std::filesystem::rename(temporary, path_);
#endif
        data_ = std::move(next);
    }
public:
    explicit Accounts(const std::filesystem::path& directory) : path_(directory / "users.txt") {
        if (!std::filesystem::exists(path_)) return;
        std::ifstream input(path_);
        if (!input || !(input >> data_) || !data_.at("users").is_array() || !data_.at("invites").is_array())
            throw std::runtime_error("账号文件格式无效。");
        std::vector<std::string> names, ids;
        for (const auto& user : data_["users"]) {
            validate(user);
            const auto name = user.at("account").get<std::string>(), id = user.at("viewerId").get<std::string>();
            if (std::find(names.begin(), names.end(), name) != names.end() || std::find(ids.begin(), ids.end(), id) != ids.end())
                throw std::runtime_error("账号文件中存在重复账号。");
            names.push_back(name); ids.push_back(id);
        }
    }
    static Json publicUser(Json user) { user.erase("passwordHash"); user.erase("salt"); user.erase("activity"); return user; }
    Json lookup(const std::string& account) const {
        for (const auto& user : data_["users"]) if (user["account"] == normalized(account)) return user;
        return nullptr;
    }
    const Json* findViewer(const std::string& viewerId) const {
        for (const auto& user : data_["users"]) if (user["viewerId"] == viewerId) return &user;
        return nullptr;
    }
    std::string displayName(const std::string& viewerId) const {
        const auto* user = findViewer(viewerId);
        return user ? user->at("displayName").get<std::string>() : "观众";
    }
    Json viewerActivity(const std::string& viewerId) const {
        const auto* user = findViewer(viewerId);
        if (!user || user->at("role") != "viewer") throw std::invalid_argument("观众账号无效。");
        const Json empty = {{"favorites", Json::array()}, {"history", Json::array()},
            {"preferences", {{"topics", Json::array()}, {"styles", Json::array()}}}};
        return user->value("activity", empty);
    }
    void saveViewerActivity(const std::string& viewerId, Json activity) {
        auto next = data_;
        auto& users = next["users"];
        const auto user = std::find_if(users.begin(), users.end(), [&](const Json& current) {
            return current["viewerId"] == viewerId && current["role"] == "viewer";
        });
        if (user == users.end()) throw std::invalid_argument("观众账号无效。");
        (*user)["activity"] = std::move(activity);
        save(std::move(next));
    }
    Json dispatch(const std::string& operation, const Json& params) {
        if (operation == "account.status") return {{"initialized", !data_["users"].empty()}};
        if (operation == "account.lookup") return {{"credential", lookup(params.value("account", ""))}};
        auto next = data_;
        if (operation == "account.invite") {
            const auto actor = lookup(params.value("actor", ""));
            if (actor.is_null() || actor["role"] != "admin") throw std::invalid_argument("仅管理员可以生成邀请码。");
            const auto hash = params.at("tokenHash").get<std::string>();
            if (!std::regex_match(hash, std::regex("[a-f0-9]{64}"))) throw std::invalid_argument("邀请码格式无效。");
            Json invites = Json::array();
            for (const auto& invite : next["invites"]) if (invite.at("expires").get<long long>() > now()) invites.push_back(invite);
            if (invites.size() >= 100) throw std::invalid_argument("有效邀请码数量已达上限，请稍后生成。");
            invites.push_back({{"tokenHash", hash}, {"expires", now() + 86400}}); next["invites"] = invites;
            save(next); return {{"expiresIn", 86400}};
        }
        if (operation != "account.register" && operation != "account.bootstrap") throw std::invalid_argument("账号操作无效。");
        const bool bootstrap = operation == "account.bootstrap";
        if (bootstrap && !data_["users"].empty()) return {{"initialized", true}};
        auto user = params.at("user");
        user.erase("activity");
        user["account"] = normalized(user.at("account").get<std::string>());
        user["displayName"] = trimText(user.at("displayName").get<std::string>());
        validate(user);
        if (!lookup(user.at("account")).is_null()) throw std::invalid_argument("这个账号已注册，请直接登录或更换账号。");
        for (const auto& existing : next["users"]) if (existing["viewerId"] == user["viewerId"]) throw std::invalid_argument("观众编号冲突，请重试。");
        if (!bootstrap && user["role"] == "admin") {
            const auto hash = params.value("tokenHash", "");
            auto& invites = next["invites"];
            const auto found = std::find_if(invites.begin(), invites.end(), [&](const Json& invite) {
                return invite.at("tokenHash") == hash && invite.at("expires").get<long long>() > now();
            });
            if (found == invites.end()) throw std::invalid_argument("管理员邀请码无效、已使用或已过期。");
            invites.erase(found);
        }
        user["createdAt"] = now();
        next["users"].push_back(user); save(next); return {{"user", publicUser(user)}};
    }
};
