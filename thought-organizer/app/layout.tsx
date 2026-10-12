import "./globals.css";
export const metadata = {
  title: "思路整理器",
  description: "把想法变成可以继续的思路",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
