#pragma once

#include "reviews.h"
#include "third_party/json.hpp"

using Json = nlohmann::json;

Documentary documentaryFromJson(const Json& value);
Review reviewFromJson(const Json& value);
Json documentaryToJson(const Documentary& film);
Json reviewToJson(const Review& review);
Documentary normalizeDocumentary(const Documentary& film);
Review normalizeReview(const Review& review);
int requiredInteger(const Json& object, const char* field);
std::vector<std::string> visualStylesFromJson(const Json& value);
std::vector<long double> parseScoreCutoffs(const Json& value);
