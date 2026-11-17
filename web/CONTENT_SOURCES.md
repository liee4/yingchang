# 影片资料与封面来源

核对日期：2026-11-17。初始资料 resources/catalog-seed.json 收录18部真实纪录片（101—118号），由 C++ 导入统一文本文件。介绍与看点为依据来源编写的摘要，类别为本项目的浏览分类。详情页提供资料入口；未核实的导演资料留空。

| 片号 | 影片 | 资料来源 |
|---|---|---|
| 101 | 蓝色星球 II | [BBC Earth 节目资料](https://www.bbcearth.com/shows/blue-planet-ii) |
| 102 | 地球脉动 II | [BBC Earth 节目资料](https://www.bbcearth.com/shows/planet-earth-ii) |
| 103 | 我们的星球 · 第一季 | [Netflix 官方节目与分集](https://www.netflix.com/title/80049832)、[Netflix 第一季制作资料](https://about.netflix.com/en/news/sir-david-attenborough-voices-new-netflix-series-our-planet-1) |
| 104 | 冰冻星球 II | [BBC Earth 节目资料](https://www.bbcearth.com/shows/frozen-planet-2) |
| 105 | 航拍中国 · 第一季 | [央视节目官网](https://tv.cctv.com/2016/12/28/VIDALOmjxOZe51NjntPvOI00161228.shtml)、[官方播出平台主创资料](https://www.bilibili.com/bangumi/media/md28229730/) |
| 106 | 第三极 | [央视节目官网](https://tv.cctv.com/2015/03/24/VIDA1427188922462442.shtml) |
| 107 | 舌尖上的中国 · 第一季 | [央视节目官网](https://tv.cctv.com/2017/01/19/VIDAtIyRXSWBaJGZ1itGdZFE170119.shtml)、[央视节目官网](https://tv.cctv.com/2012/12/11/VIDA1355162565967728.shtml) |
| 108 | 寻味顺德 | [央视节目官网](https://tv.cctv.com/2016/04/19/VIDAKPo5OpisU1jWG5erv6m7160419.shtml) |
| 109 | 茶，一片树叶的故事 | [央视《茶》官方专题](https://jishi.cntv.cn/special/cha/index.shtml)、[央视首映与主创资料](https://jishi.cntv.cn/2013/11/12/ARTI1384249625593893.shtml) |
| 110 | 河西走廊 | [央视节目官网](https://tv.cctv.com/2022/07/04/VIDAvNhIUgppFT0adfBhvj0M220704.shtml)、[首播时期节目介绍](https://www.gsau.edu.cn/info/1280/1389.htm) |
| 111 | 如果国宝会说话 · 第一季 | [央视第一季专题与文物目录](https://jishi.cctv.com/special/djsb/guobao/index.shtml)、[央视第一季集数资料](https://jishi.cctv.com/2018/05/18/ARTIECje4wBMs9vcNWK3DtLg180518.shtml) |
| 112 | 我在故宫修文物 | [清华大学艺术博物馆放映与主创资料](https://www.artmuseum.tsinghua.edu.cn/ggjy/ztjz_910/jzyy/202111/t20211119_16959.shtml)、[央视节目官网](https://tv.cctv.com/2015/12/30/VIDA1451462807578701.shtml) |
| 113 | 人生第一次 | [央视节目官网](https://tv.cctv.com/2020/05/21/VIDAonMbfGREx0Jpev2TInlB200521.shtml)、[联合出品平台制作资料](https://www.bilibili.com/bangumi/play/ep548360) |
| 114 | 书简阅中国 | [央视节目官网](https://tv.cctv.com/2021/02/08/VIDAHc9krezHR6EXJAq7w0nM210208.shtml) |
| 115 | 超级工程 · 第一季 | [央视节目官网](https://tv.cctv.com/2014/11/03/VIDA1415000730892868.shtml)、[央视节目官网](https://tv.cctv.com/2012/12/10/VIDA1355149961979490.shtml) |
| 116 | 神奇的嫦娥五号 · 电视版 | [央视节目官网](https://tv.cctv.com/2023/11/24/VIDAej3ZbMMVw378YHrRtp1u231124.shtml) |
| 117 | 中国探月 | [央视节目官网](https://tv.cctv.com/2024/04/22/VIDA0GtCvQzF4ZHPQtjnX3Gw240422.shtml) |
| 118 | 绿色星球 | [BBC Earth 节目资料](https://www.bbcearth.com/shows/the-green-planet) |

## 版本与分集

集数区分季与版本：《如果国宝会说话》第一季25集；《我在故宫修文物》为三集电视版；《神奇的嫦娥五号》为四集电视版。部分节目仅选列官方页面中的部分分集，以“分集选读”展示。英文分集名附有中文阅读辅助译名。

## 图片与评价

14张官方节目宣传图/剧照缓存于 public/posters/103.webp、105.webp—117.webp。逐张来源、原图链接、尺寸与权利说明见 public/posters/sources.json。版权属于对应权利人，未标为自由授权素材。

101、102、104、118号沿用旧demo的对应自然主题生成插画，详情页明确标为“主题插画”，不冒充官方海报。原1—10号图片保留用于兼容旧数据。

24条预置评价为合成演示数据，带isSample标记，页面显示“演示”。分数按本站课程公式计算，包含演示记录时明确提示；不代表豆瓣、Netflix等平台评分。观众实际提交后，对应评价不再带演示标记。

## 旧数据兼容

页头“映场”书法字标基于 Google Fonts 的 Ma Shan Zheng（马善政楷书）字形转换为本地 SVG 路径，配小型印章图形，离线可显示。字体来源：https://github.com/google/fonts/tree/main/ofl/mashanzheng ，SIL Open Font License 1.1 随附在 `public/icons/wordmark-OFL.txt`。

真实影片使用独立编号。检测到旧版片库时，保留原片号、用户修改及评价，增加新片，旧片标为“旧版演示片目”。迁移完成后仅使用统一文本文件，删除的影片不会因重启重新出现。旧浏览器中的实际评价修改保留原关联。

## 2026-11-17 主创署名核验

本轮补充原先空缺的 9 部署名。具体补充值与逐片链接保存在 `resources/credits-enrichment.json`；实际运行资料通过 HTTP → C++ 更新，未重写评价或账号文件。

- 蓝色星球 II、地球脉动 II：依据 [Television Academy 蓝色星球 II](https://www.televisionacademy.com/shows/blue-planet-ii) 与 [地球脉动 II](https://www.televisionacademy.com/shows/planet-earth-ii) 的署名，分别补充系列制片人 Mark Brownlow、Tom Hugh-Jones；执行制片人与系列制片人归入主创，导演保留明确的待核实说明。
- 我们的星球第一季：分集导演依据 [IDA 2019 提名制作名单](https://www.documentary.org/sites/default/files/images/press-releases/IDA_PressRelease102319_AwardsNominees.pdf)；系列制片人可与 [制作方 Silverback](https://silverbackfilms.tv/shows/our-planet/) 核对。
- 冰冻星球 II：系列制片人 Elizabeth White 依据 [BBC Earth 访谈](https://www.bbcearth.com/news/the-changing-face-of-our-frozen-worlds)；执行制片人 Mark Brownlow 依据 [ITV 制作资料](https://www.itv.com/presscentre/press-releases/plimsoll-productions-strengthens-its-natural-history-unit-tapping-multi-award-winning)。
- 河西走廊：王新建总导演、赵启辰执行总导演，依据 [人民网主创采访](https://paper.people.com.cn/hqrw/html/2016-10/26/content_1726905.htm)。
- 书简阅中国：金铁木、戴修扬，依据 [中国文艺网介绍](https://www.cflac.org.cn/new_ys/ysds/hd/202209/t20220923_1258871.html)。
- 神奇的嫦娥五号：窦欣平原系列导演依据 [电影计划导演履历](https://www.sfilmmaker.com/fund/filminfo?id=49)，电视整合版的独立署名尚待核实，页面已区分。
- 中国探月：史慧、刘昀依据 [百度百科 2024 年版资料](https://wapbaike.baidu.com/item/中国探月/64339378)；此为二手资料，央视节目主页面未填写导演，不冒充官方核定。
- 绿色星球：依据 [PBS 播出方制作资料](https://www.pbs.org/about/about-pbs/blogs/news/pbs-announces-the-green-planet/) 补充系列制片人 Rupert Barrington 与执行制片人 Michael Gunton。

四部 BBC 系列的分集导演名单尚未逐项确认，均明确写为「分集导演制（导演名单待核实）」。上述状态和来源在详情页可见。

《中国探月》单集时长修正为约 15 分钟：[央视完整第一集](https://tv.cctv.com/2024/04/22/VIDEJSu81rZxGhgTHS4kt9qN240422.shtml) 对应官方视频元数据 len 为 00:14:21，原先约 50 分钟的填写有误。
