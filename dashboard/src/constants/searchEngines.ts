import bingLogo from "../assets/search-engines/bing.ico";
import braveLogo from "../assets/search-engines/brave.png";
import duckduckgoLogo from "../assets/search-engines/duckduckgo.ico";
import ecosiaLogo from "../assets/search-engines/ecosia.png";
import googleLogo from "../assets/search-engines/google.ico";
import qwantLogo from "../assets/search-engines/qwant.ico";
import yahooLogo from "../assets/search-engines/yahoo.ico";

export interface SearchEngine {
  name: string;
  slug: string;
  url: string;
  logo: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    name: "Bing",
    slug: "bing",
    url: "https://www.bing.com/search?q=",
    logo: bingLogo,
  },
  {
    name: "Brave",
    slug: "brave",
    url: "https://search.brave.com/search?q=",
    logo: braveLogo,
  },
  {
    name: "DuckDuckGo",
    slug: "duckduckgo",
    url: "https://duckduckgo.com/?q=",
    logo: duckduckgoLogo,
  },
  {
    name: "Ecosia",
    slug: "ecosia",
    url: "https://www.ecosia.org/search?q=",
    logo: ecosiaLogo,
  },
  {
    name: "Google",
    slug: "google",
    url: "https://www.google.com/search?q=",
    logo: googleLogo,
  },
  {
    name: "Qwant",
    slug: "qwant",
    url: "https://www.qwant.com/?q=",
    logo: qwantLogo,
  },
  {
    name: "Yahoo",
    slug: "yahoo",
    url: "https://search.yahoo.com/search?p=",
    logo: yahooLogo,
  },
];
