# 映场

纪录片放映周的浏览、评价与推荐系统。网页包含观众片库、综合与分类榜单、影片详情，以及管理员片目维护和评分统计。C++17 终端版可独立运行。

## 运行网页

需要 Node.js 18 或更高版本。进入 `web` 目录启动本地服务，无需先安装 npm 依赖。

```sh
cd web
npm run dev
```

打开 [本地网页](http://127.0.0.1:4173/)。观众选入口即可浏览。管理员演示账号是 `admin`，密码是 `admin123`。首次运行使用内置样例，操作数据保存到 `web/data/catalog.json`。

## 源码入口

- `web/src/app.js` 管理观众端路由、片库、榜单和评分。
- `web/src/spotlight.js` 和 `web/src/styles.css` 实现横向展映栏、悬停展开及响应式布局。
- `web/src/admin.js` 实现身份选择、管理员界面与统计展示。
- `web/src/catalog.js` 和 `web/scripts/catalog-api.mjs` 负责样例、评分规则、登录校验和文件保存。
- `cpp/` 包含 C++17 终端版，编译命令与审核步骤见 [终端版说明](cpp/README.md)。

网页和终端版都面向本地演示，各自保存数据。网页打包与静态资源测试在 `web` 目录执行。

```sh
npm run build
npm run test:sites
```
