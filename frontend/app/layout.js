import { Inter, Manrope } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-manrope" });

export const metadata = { title: "Подготовка к экзамену" };

export default function RootLayout({ children }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} ${manrope.variable}`}>
        {/* тема и свёрнутость меню выставляются до отрисовки, чтобы не мигали */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{var d=document.documentElement;d.dataset.theme=localStorage.getItem("examTheme")||"dark";` +
          `d.dataset.sidebar=localStorage.getItem("sidebar")||"open"}catch(e){}` }} />
        {children}
      </body>
    </html>
  );
}
