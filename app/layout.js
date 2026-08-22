import "./globals.css";

export const metadata = {
  title: "FitMeal · AI 饮食计划生成器",
  description: "面向健身 / 运动 / 备赛人群的本地化周饮食计划生成器：透明可解释的营养计算，零运行时外部依赖。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
