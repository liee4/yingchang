# 映场网页

网页是整套程序的唯一日常操作入口。在项目根目录双击“启动映场.cmd”或运行 `npm start`；本目录也可运行 `npm run dev`。服务会自动编译并启动常驻 C++ 核心，需要 Node.js 18+ 和 GCC C++17，不需要 npm install。

- 片库与详情保留真实影片、完整介绍、看点、分集、来源与本地封面。
- 管理员支持片目维护、全部评价与分数段统计；登录会话由 Node.js 管理。
- 观众可查询、评分、复评，查看 C++ 返回的综合、内容、画面与讲解榜单。
- 浏览器只展示结果与收集表单，不自行计算评分、排序或统计。

`catalog-api.mjs` 仅处理 HTTP 和权限；`core-client.mjs` 用 JSON 行协议连接 C++。所有业务写入统一交给 C++，保存到项目根目录 `data/documentaries.txt` 和 `data/reviews.txt`。本目录下的旧 `data/catalog.json` 只会在首次迁移时读取、备份和归档，之后不再作为数据库。

初始资料在根目录 `resources/catalog-seed.json`。新片使用独立编号，保留旧评价关联；演示评价和主题插画明确标注。每部影片详情都有资料入口，来源见 [CONTENT_SOURCES.md](CONTENT_SOURCES.md)。

## 开发与验证

- `npm test`：完整 C++ 调用链集成测试；使用临时目录，不修改演示数据。
- `npm run build:core`：编译或复用 C++ 核心。
- `npm run debug:cpp`：调试终端，需先停止网页服务；数据和锁与网页相同。
- `npm run build` / `npm run test:sites`：静态资源打包验证，不能替代本地 Node.js + C++ 服务。

浏览器刷新或切换主要页面时会重新读取 C++ 快照，修改后的评价、人数与榜单使用同一份结果。核心不可用时返回 503，不会降级为独立 JavaScript 数据。
