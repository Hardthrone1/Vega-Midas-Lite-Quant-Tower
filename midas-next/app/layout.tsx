import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'MIDAS Orchestrator | Pine Script Engine',
  description: 'Pine Script v5 Validation & Repair Framework',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-200 antialiased min-h-screen flex flex-col font-sans">
        
        {/* GLOBAL NAVIGATION */}
        <nav className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              
              {/* LOGO & LINKS */}
              <div className="flex items-center space-x-2 md:space-x-8">
                <div className="flex-shrink-0 flex items-center mr-4">
                  <span className="text-xl font-bold text-white tracking-tighter">
                    MIDAS<span className="text-blue-500">_</span>
                  </span>
                </div>
                
                <div className="flex space-x-1 md:space-x-2">
                  <Link 
                    href="/diagnostics" 
                    className="px-3 py-2 rounded-md text-xs md:text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    Diagnostics
                  </Link>
                  <Link 
                    href="/testing" 
                    className="px-3 py-2 rounded-md text-xs md:text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    Testing
                  </Link>
                  <Link 
                    href="/results" 
                    className="px-3 py-2 rounded-md text-xs md:text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    Vault
                  </Link>
                </div>
              </div>

              {/* SYSTEM STATUS */}
              <div className="flex items-center hidden sm:flex">
                 <span className="flex items-center text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 tracking-widest uppercase">
                   <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                   Engine Online
                 </span>
              </div>
            </div>
          </div>
        </nav>

        {/* MAIN CONTENT ZONE */}
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

      </body>
    </html>
  );
}
