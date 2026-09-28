import "./globals.css";
export const metadata={title:"KSpiel",description:"Fictional operational command simulation"};
export const viewport={width:"device-width",initialScale:1,viewportFit:"cover" as const,themeColor:"#0e120d"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
