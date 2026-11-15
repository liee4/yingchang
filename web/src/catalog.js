// 样例片目和已有短评供本地网页原型使用。
export const sampleFilms = [
  { id: 1, title: "蓝色星球", category: "自然", episodes: 6, synopsis: "从阳光照亮的浅海到幽暗的深海，跟随鲸群的迁徙，观察海洋生命如何利用潮汐和洋流。" },
  { id: 2, title: "沙海来信", category: "人文", episodes: 4, synopsis: "沿着穿越沙丘的旧商道，记录旅人、牧民和绿洲居民如何在沙漠中辨认方向、寻找水源。" },
  { id: 3, title: "一把泥土", category: "人文", episodes: 5, synopsis: "走进陶艺工坊，从选土、拉坯到烧制，观察一件日用器皿背后的经验与耐心。" },
  { id: 4, title: "雪山之上", category: "自然", episodes: 6, synopsis: "摄影团队随巡护员进入高山，在岩壁与积雪之间寻找雪豹活动的痕迹。" },
  { id: 5, title: "追星的人", category: "科学", episodes: 5, synopsis: "跟随天文观测员度过山顶的几个夜晚，了解望远镜怎样把微弱星光记录下来。" },
  { id: 6, title: "雨林深处", category: "自然", episodes: 6, synopsis: "从潮湿的林地到高处的树冠，记录热带雨林居民在雨季里的日常。" },
  { id: 7, title: "湿地往事", category: "自然", episodes: 5, synopsis: "观察河流和候鸟如何随季节变化，走访在湿地边生活的人们。" },
  { id: 8, title: "城市夜行", category: "人文", episodes: 4, synopsis: "沿着夜班公交与灯火下的街道，认识午夜过后仍在工作的人。" },
  { id: 9, title: "冰川边缘", category: "科学", episodes: 5, synopsis: "跟随野外测量队记录冰川的变化，了解他们如何用影像和数据追踪冰线。" },
  { id: 10, title: "山间茶事", category: "人文", episodes: 4, synopsis: "在茶山的一季采收中，记录采摘、炒制与品茶的日常。" },
].map((film) => ({ director: "", crew: "", posterId: film.id, ...film }));

const sampleReviews = [
  [1, "U101", 5, 5, 5, "鲸群转身的那一段很难忘，讲解也清楚。"],
  [1, "U108", 5, 5, 4, "浅海到深海的变化让人印象很深。"],
  [1, "U112", 4, 5, 4, "水下画面很细腻，希望能多讲一点洋流。"],
  [2, "U105", 4, 5, 4, "沙丘上的脚印和风声拍得很有现场感。"],
  [2, "U108", 4, 4, 4, "听完牧民辨认方向的故事，想再看一遍。"],
  [3, "U102", 5, 4, 5, "拉坯和烧制都拍到了，节奏很舒服。"],
  [3, "U106", 5, 4, 4, "几处手部特写特别有意思。"],
  [4, "U102", 5, 5, 4, "雪豹经过岩脊的长镜头很漂亮。"],
  [4, "U109", 4, 5, 4, "巡护员讲解如何找足迹的那段最有意思。"],
  [5, "U103", 4, 4, 5, "第一次看懂实地观测是怎么做的。"],
  [5, "U107", 4, 5, 5, "星空镜头很美，旁白没有抢画面。"],
  [6, "U104", 4, 5, 4, "雨林的声音很丰富，分层拍摄也很直观。"],
  [7, "U110", 4, 4, 4, "候鸟出现得很自然，和人的故事连在一起。"],
  [8, "U111", 4, 4, 3, "夜班司机的故事很平实。"],
  [9, "U115", 4, 5, 5, "看完对冰川测量有了更清楚的认识。"],
];

export const legacyStorageKey = "documentary-screening-week-reviews-v1";
export const initialReviews = sampleReviews.map(([filmId, viewerId, content, image, narration, comment]) =>
  ({ filmId, viewerId, content, image, narration, comment }));

export const scoreFields = [
  { id: "content", label: "内容" },
  { id: "image", label: "画面" },
  { id: "narration", label: "讲解" },
];

export function scoreReview(review, metric = "overall") {
  return metric === "overall"
    ? (2 * review.content + review.image + review.narration) / 4
    : review[metric];
}

export function filmAverage(reviews, metric = "overall") {
  return reviews.reduce((sum, review) => sum + scoreReview(review, metric), 0) / reviews.length;
}

export function rankingFor(films, reviews, metric) {
  return films.map((film) => {
    const rated = reviews.filter((review) => review.filmId === film.id);
    return { film, count: rated.length, average: filmAverage(rated, metric) };
  }).filter(({ count }) => count > 0)
    .sort((a, b) => b.average - a.average || b.count - a.count || a.film.id - b.film.id)
    .slice(0, 10);
}

export function parseCutoffs(input) {
  const tokens = input.trim().split(/\s+/);
  const cutoffs = tokens.map((token) => /^\d+(?:\.\d+)?$/.test(token) ? Number(token) : NaN);
  if (cutoffs.some((value, index) => !(value > (cutoffs[index - 1] ?? 1) && value < 5))) {
    throw new Error("分界点须大于 1、小于 5，并按从小到大的顺序用空格分隔。");
  }
  return cutoffs;
}

export function scoreDistribution(films, reviews, cutoffs) {
  const counts = new Map(films.map(({ id }) => [id, Array(cutoffs.length + 1).fill(0)]));
  for (const review of reviews) {
    const score = scoreReview(review);
    const upper = cutoffs.findIndex((cutoff) => score < cutoff);
    const row = counts.get(review.filmId);
    if (row) row[upper < 0 ? cutoffs.length : upper]++;
  }
  return counts;
}
