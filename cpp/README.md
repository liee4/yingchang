# 映场 C++ 核心

C++17 负责片目、评价、输入校验、查询、评分、排序、统计与统一数据文件。常驻 `--stdio` 模式为网页服务；不带该参数是调试菜单。两种模式使用同一核心程序、同一根目录 `data` 和同一独占锁。

正常使用从项目根目录启动网页，启动器会自动编译。可在根目录运行 `npm run build:core` 单独编译，运行 `npm run debug:cpp` 进入菜单。编译结果缓存于 `cpp/build/`，文件名包含源码摘要，源码改变后自动生成新版本。

## 手动编译

在本目录用 GCC 执行（Windows）：

```sh
g++ -std=c++17 -Wall -Wextra -pedantic -finput-charset=UTF-8 -fexec-charset=UTF-8 main.cpp documentary_catalog.cpp reviews.cpp record_codec.cpp data_store.cpp core_service.cpp -o documentary.exe -lshell32
```

Linux/macOS 去掉 `-lshell32` 并将输出名改为 `documentary`。Windows 的原生宽字符参数用于支持中文目录。Visual Studio 开发环境也可将 `CXX` 设为 `cl`，使用 Node 编译脚本，它会选择对应参数并链接 Shell32。

手动编译出的程序放在 `cpp` 下时，默认数据目录仍为项目根目录 `data`。也可显式指定 `--data-dir` 或 `YINGCHANG_DATA_DIR`。不要在网页运行时启动调试终端写相同目录。

## 业务与文件

- `documentary_catalog.*`：片目结构与增删改查，保留完整扩展信息。
- `reviews.*`：评价结构、复评、加权综合分、前十排名、分数段计数。
- `record_codec.*`：整数、文本、评分、扩展字段和链接校验；UTF-8 JSON 编解码。
- `data_store.*`：固定目录、系统级独占锁、旧数据迁移、备份、双文件事务与启动恢复。
- `core_service.*`：标准输入输出协议、查询和网页所需结果。
- `main.cpp`：启动模式与调试菜单。

`DocumentaryCatalog` 和 `Reviews` 在服务中使用暂存模式：先对副本执行全部校验和操作，再提交两个文本文件，提交成功后才公布新内存状态。调试菜单也使用这些业务类及同一文件格式。片号唯一且不可通过修改请求重分配；评价用“片号 + 去除首尾空白的观众编号”定位，编号区分大小写。

新文件每行一条 JSON，对中文、换行、引号与反斜线安全转义。可兼容旧引号分隔文本与 UTF-8 BOM。输入无效时旧评价不变；文件异常时保留原文件并报错。标准输出只写接口 JSON；迁移与诊断信息写标准错误。

## 测试

在本目录执行 `node test.mjs`，或在根目录执行 `npm run test:cpp`。需要 Node.js 和 GCC。测试覆盖业务类、终端菜单、复评、并列排序、非法输入、文件损坏、Windows 文件占用与恢复。网页完整集成测试在根目录执行 `npm test`。

第三方 JSON 库只用于 JSON 编解码，完整源码与 MIT 许可随项目保留在 `third_party/`；课程业务逻辑均在上述项目代码中。
