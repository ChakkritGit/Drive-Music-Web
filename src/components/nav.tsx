import { FolderOpen, Home as HomeIcon, Library as LibraryIcon, ListMusic } from "lucide-react";

/** The four places the app has, shared by the desktop sidebar and the phone's bottom nav. */
export const NAV_ITEMS: {
  href: string;
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
  label: string;
}[] = [
  { href: "/", match: (p) => p === "/", icon: <HomeIcon className="h-[18px] w-[18px]" />, label: "Home" },
  { href: "/browse", match: (p) => p.startsWith("/browse"), icon: <FolderOpen className="h-[18px] w-[18px]" />, label: "Browse" },
  { href: "/playlists", match: (p) => p.startsWith("/playlists"), icon: <ListMusic className="h-[18px] w-[18px]" />, label: "Playlists" },
  { href: "/library", match: (p) => p.startsWith("/library"), icon: <LibraryIcon className="h-[18px] w-[18px]" />, label: "Library" },
];
