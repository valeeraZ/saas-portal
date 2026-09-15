import "./styles.css";
export const metadata = {
  title: "SaaS Portal",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header>
          <a href="/">Portal</a>
          <span>工作空间</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
