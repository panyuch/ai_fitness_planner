// lib/foods.js
// 本地精选食材库（离线、无外部 API）。每条含每 100g 的 kcal / p(蛋白) / c(碳水) / f(脂肪)。
// 数据来源：中国食物成分表（第 6 版）/ USDA FoodData Central，取常见可食部近似值。

export const FOODS = [
  // ---- 碳水主食 carb (7) ----
  { id: "rice", name: "米饭(熟)", pool: "carb", kcal: 116, p: 2.6, c: 25.9, f: 0.3 },
  { id: "oats", name: "燕麦(干)", pool: "carb", kcal: 389, p: 16.9, c: 66.3, f: 6.9 },
  { id: "wbread", name: "全麦面包", pool: "carb", kcal: 247, p: 13.0, c: 41.0, f: 3.4 },
  { id: "sweetpotato", name: "红薯", pool: "carb", kcal: 86, p: 1.6, c: 20.1, f: 0.1 },
  { id: "potato", name: "土豆", pool: "carb", kcal: 77, p: 2.0, c: 17.0, f: 0.1 },
  { id: "corn", name: "玉米", pool: "carb", kcal: 106, p: 4.0, c: 22.8, f: 1.2 },
  { id: "banana", name: "香蕉", pool: "carb", kcal: 89, p: 1.1, c: 22.8, f: 0.3 },

  // ---- 主蛋白 protein (8) ----
  { id: "chicken", name: "鸡胸肉", pool: "protein", kcal: 165, p: 31.0, c: 0, f: 3.6 },
  { id: "beef", name: "瘦牛肉", pool: "protein", kcal: 125, p: 20.2, c: 0, f: 4.5 },
  { id: "pork", name: "猪里脊", pool: "protein", kcal: 143, p: 20.2, c: 1.5, f: 6.2 },
  { id: "salmon", name: "三文鱼", pool: "protein", kcal: 208, p: 20.0, c: 0, f: 13.0 },
  { id: "tuna", name: "金枪鱼(水浸)", pool: "protein", kcal: 116, p: 26.0, c: 0, f: 1.0 },
  { id: "shrimp", name: "虾仁", pool: "protein", kcal: 99, p: 24.0, c: 0.2, f: 0.3 },
  { id: "egg", name: "鸡蛋", pool: "protein", kcal: 143, p: 13.0, c: 0.7, f: 9.5 },
  { id: "tofu", name: "北豆腐", pool: "protein", kcal: 84, p: 8.1, c: 1.9, f: 3.7 },

  // ---- 蔬菜 veg (5) ----
  { id: "broccoli", name: "西兰花", pool: "veg", kcal: 34, p: 2.8, c: 6.6, f: 0.4 },
  { id: "spinach", name: "菠菜", pool: "veg", kcal: 23, p: 2.9, c: 3.6, f: 0.4 },
  { id: "tomato", name: "番茄", pool: "veg", kcal: 18, p: 0.9, c: 3.9, f: 0.2 },
  { id: "cucumber", name: "黄瓜", pool: "veg", kcal: 15, p: 0.7, c: 3.6, f: 0.1 },
  { id: "lettuce", name: "生菜", pool: "veg", kcal: 15, p: 1.4, c: 2.9, f: 0.2 },

  // ---- 健康脂肪 fat (3) ----
  { id: "oliveoil", name: "橄榄油", pool: "fat", kcal: 884, p: 0, c: 0, f: 100.0 },
  { id: "almond", name: "杏仁(生)", pool: "fat", kcal: 579, p: 21.0, c: 22.0, f: 50.0 },
  { id: "avocado", name: "牛油果", pool: "fat", kcal: 160, p: 2.0, c: 9.0, f: 15.0 },

  // ---- 水果 fruit (3) ----
  { id: "apple", name: "苹果", pool: "fruit", kcal: 52, p: 0.3, c: 13.8, f: 0.2 },
  { id: "blueberry", name: "蓝莓", pool: "fruit", kcal: 57, p: 0.7, c: 14.5, f: 0.3 },
  { id: "orange", name: "橙子", pool: "fruit", kcal: 47, p: 0.9, c: 11.8, f: 0.1 },

  // ---- 乳制品 dairy (3) ----
  { id: "greekyogurt", name: "希腊酸奶", pool: "dairy", kcal: 59, p: 10.0, c: 3.6, f: 0.4 },
  { id: "milk", name: "全脂牛奶", pool: "dairy", kcal: 61, p: 3.2, c: 4.8, f: 3.3 },
  { id: "cheddar", name: "切达奶酪", pool: "dairy", kcal: 403, p: 25.0, c: 1.3, f: 33.0 },
];

export const POOLS = FOODS.reduce((acc, f) => {
  (acc[f.pool] ||= []).push(f);
  return acc;
}, {});

const BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export function getFood(id) {
  return BY_ID[id] || null;
}

// 取某池中的第 idx 个食材（idx 越界则取模，便于按餐次轮换）
export function poolItem(pool, idx) {
  const items = POOLS[pool] || [];
  return pickFrom(items, idx);
}

// 从任意食材列表中按 idx 取（取模环绕），供生成器按自定义槽位轮换
export function pickFrom(list, idx) {
  if (!list || !list.length) return null;
  return list[((idx % list.length) + list.length) % list.length];
}

export default FOODS;
