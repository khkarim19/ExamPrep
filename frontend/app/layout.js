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
        <script dangerouslySetInnerHTML={{ __html:
          `try{document.documentElement.dataset.theme=localStorage.getItem("examTheme")||"dark"}catch(e){}` }} />
        {children}
      </body>
    </html>
  );
}
