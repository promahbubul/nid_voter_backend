const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const ROOT_DIR = path.resolve(__dirname, "../..");
const INPUT_DIR = process.env.INPUT_DIR || path.join(ROOT_DIR, "output");
const OUTPUT_DIR = process.env.NORMALIZED_OUTPUT_DIR || path.join(ROOT_DIR, "output-normalized");

const VOTER_TEXT_FIELDS = [
  "voter_area_name_raw",
  "district_raw",
  "upazila_raw",
  "union_or_board_raw",
  "migration_status_raw",
  "name_raw",
  "father_name_raw",
  "mother_name_raw",
  "occupation_raw",
  "birth_date_raw",
  "address_raw",
];

const AREA_TEXT_FIELDS = [
  "source_folder",
  "voter_area_name_raw",
  "district_raw",
  "upazila_raw",
  "union_or_board_raw",
];

const SOURCE_FILE_TEXT_FIELDS = [
  "source_folder",
  "voter_area_name_raw",
  "district_raw",
  "upazila_raw",
  "union_or_board_raw",
];

const SUSPICIOUS_CHAR_PATTERN = /[ÏÎƣĔ×ƁėĤËŘƀĺſƃĢÐĦŇŌũƄĨõƆśńęĩŐįűŞ¢ŽýŮăĴūÔÚłşƂĳƏŨáŝħēÙêļŔyz◌]/u;

const CHAR_REPLACEMENTS = new Map([
  ["Ĕ", "ত্র"],
  ["×", "ক্ত"],
  ["ƣ", "কু"],
  ["ė", "দ্দ"],
  ["Ë", "্য"],
  ["Ř", "শ্র"],
  ["ƀ", "সু"],
  ["ƃ", "দু"],
  ["Ƅ", "শু"],
  ["Ɓ", "রু"],
  ["Ƃ", "রু"],
  ["Ɔ", "হু"],
  ["ſ", "নু"],
  ["ĺ", "ব্দ"],
  ["Ģ", "ন্ত"],
  ["Ĥ", "ন্দ"],
  ["Ħ", "ন্ধ"],
  ["Ň", "ম্ম"],
  ["Ō", "ল্ল"],
  ["ũ", "স্ত"],
  ["Ĩ", "ন্ন"],
  ["õ", "জ্জ"],
  ["Ĵ", "প্র"],
  ["Î", "্র"],
  ["Ï", "ে"],
  ["Ð", "ৈ"],
  ["ń", "ম্ব"],
  ["ę", "দ্র"],
  ["ĩ", "ন্স"],
  ["Ő", "ল্প"],
  ["į", "ন্য"],
  ["ű", "স্ত্র"],
  ["Ş", "স্ট"],
  ["Ũ", "স্ট"],
  ["¢", "ন"],
  ["ý", "ঞ্জ"],
  ["Ů", "স্ব"],
  ["ă", "ড্র"],
  ["ū", "ন্স"],
  ["Ô", "ক্ষ"],
  ["Ú", "ক্ষ"],
  ["Ù", "ক্ষ"],
  ["ł", "ন্দ"],
  ["ş", "ষ্ঠ"],
  ["ĳ", "প্ন"],
  ["ŝ", "ষ্ণ"],
  ["ħ", "ন্দ্র"],
  ["ē", "ত্ত"],
  ["ê", "ঙ্গ"],
  ["ļ", "ব্ব"],
  ["Ŕ", "শ্চ"],
  ["", "ণ্ড"],
  ["á", "গ্ন"],
  ["ś", "শ্ব"],
  ["Ľ", "ব্র"],
  ["Ǝ", "স্ত"],
  ["ů", "স্ম"],
  ["ø", "জ্ঞ"],
  ["ď", "ত্ন"],
  ["å", "গ্র"],
  ["ú", "জ"],
  ["û", "ঞ্চ"],
  ["ř", "শ্য"],
  ["Ÿ", "ক্ষ"],
  ["ƅ", "হৃ"],
  ["ž", "ড়"],
  ["Ž", "গু"],
]);

const TOKEN_OVERRIDES = new Map([
  ["Ïমাঃ", "মোঃ"],
  ["Ïমা:", "মো:"],
  ["Ïমাছাঃ", "মোছাঃ"],
  ["Ïমাছা:", "মোছা:"],
  ["Ïমাসাঃ", "মোসাঃ"],
  ["Ïমাসা:", "মোসা:"],
  ["ওয়াডÎ", "ওয়ার্ড"],
  ["পাটÎ", "পার্ট"],
  ["Ïবগম", "বেগম"],
  ["আ×ার", "আক্তার"],
  ["ছাĔ", "ছাত্র"],
  ["ছাĔী", "ছাত্রী"],
  ["ছাĔ/ছাĔী", "ছাত্র/ছাত্রী"],
  ["ƣশমাইল", "কুশমাইল"],
  ["Ïহােসন", "হোসেন"],
  ["উিėন", "উদ্দিন"],
  ["উėীন", "উদ্দীন"],
  ["Řিমক", "শ্রমিক"],
  ["Ïনছা", "নেছা"],
  ["আĺুল", "আব্দুল"],
  ["আĺুর", "আব্দুর"],
  ["আĺুস", "আব্দুস"],
  ["Ïদওেখালা", "দেওখোলা"],
  ["চাƣরী", "চাকুরী"],
  ["বËবসা", "ব্যবসা"],
  ["Ïবসরকারী", "বেসরকারী"],
  ["মডল", "মণ্ডল"],
  ["আĦািরয়া", "আন্ধারিয়া"],
  ["কাĤািনয়া", "কান্দানিয়া"],
  ["Ðকয়ারচালা", "কৈয়ারচালা"],
  ["Ïজাড়বাড়ীয়া", "জোড়বাড়ীয়া"],
  ["Ïজারবাড়ীয়া", "জোরবাড়ীয়া"],
  ["Ïজারবািড়য়া", "জোরবাড়িয়া"],
  ["চħ", "চন্দ্র"],
  ["আকĤ", "আকন্দ"],
  ["ÏমাহাŇদ", "মোহাম্মদ"],
  ["ƀিফয়া", "সুফিয়া"],
  ["Ïবকার", "বেকার"],
  ["িবদËানĤ", "বিদ্যানন্দ"],
  ["বাſ", "বানু"],
  ["Řী", "শ্রী"],
  ["Ïখােদজা", "খোদেজা"],
  ["নজƁল", "নজরুল"],
  ["আিńয়া", "আম্বিয়া"],
  ["সেĢাষপুর", "সন্তোষপুর"],
  ["উēর", "উত্তর"],
  ["বালাśর", "বালাশ্বর"],
  ["Ïরােকয়া", "রোকেয়া"],
  ["ÐবদËবাড়ী", "বৈদ্যবাড়ী"],
  ["Ïগালাম", "গোলাম"],
  ["Ïসায়াইতপুর", "সোয়াইতপুর"],
  ["Ïরিজয়া", "রেজিয়া"],
  ["উেŇ", "উম্মে"],
  ["ƣলছুম", "কুলছুম"],
  ["ƣলƀম", "কুলসুম"],
  ["Ïতলীåাম", "তেলীগ্রাম"],
  ["Ïশখ", "শেখ"],
  ["ƃলাল", "দুলাল"],
  ["ſƁল", "নুরুল"],
  ["Ïমাũফা", "মোস্তফা"],
  ["মাĨান", "মান্নান"],
  ["ƀƁজ", "সুরুজ"],
  ["নূƁল", "নূরুল"],
  ["শিফƣল", "শফিকুল"],
  ["রিফƣল", "রফিকুল"],
  ["জƆরা", "জহুরা"],
  ["মুিশÎদা", "মুর্শিদা"],
  ["Ïবপারী", "বেপারী"],
  ["ſরজাহান", "নুরজাহান"],
  ["Ïহারবাড়ী", "হোরবাড়ী"],
  ["Ïজােবদা", "জোবেদা"],
  ["রাõাক", "রাজ্জাক"],
  ["Ïহলাল", "হেলাল"],
  ["দবরদũা", "দবরদস্তা"],
  ["Ïমাতােলব", "মোতালেব"],
  ["Ïশফালী", "শেফালী"],
  ["Ïমাফাõল", "মোফাজ্জল"],
  ["িনিŔĢপুর", "নিশ্চিন্তপুর"],
  ["মধËপাড়া", "মধ্যপাড়া"],
  ["Ïবতবাড়ী", "বেতবাড়ী"],
  ["কėুছ", "কদ্দুছ"],
  ["িশÙক", "শিক্ষক"],
  ["মুĩী", "মুন্সী"],
  ["ইউſছ", "ইউনুছ"],
  ["িমűী", "মিস্ত্রী"],
  ["িবŌাল", "বিল্লাল"],
  ["লাêল", "লাঙ্গল"],
  ["লÙীপুর", "লক্ষীপুর"],
  ["লÚীপুর", "লক্ষীপুর"],
  ["িছিėক", "ছিদ্দিক"],
  ["ƀলতান", "সুলতান"],
  ["ƀলতানা", "সুলতানা"],
  ["ফাƁক", "ফারুক"],
  ["পাƁল", "পারুল"],
  ["কৃŝ", "কৃষ্ণ"],
  ["কৃŝপুর", "কৃষ্ণপুর"],
  ["মিজÎনা", "মর্জিনা"],
  ["ইিęস", "ইদ্রিস"],
  ["ইিęছ", "ইদ্রিছ"],
  ["হাƁন", "হারুন"],
  ["ƁƆল", "রুহুল"],
  ["ইĽাহীম", "ইব্রাহীম"],
  ["আহাŇদ", "আহাম্মদ"],
  ["Ɔেসন", "হুসেন"],
  ["ইউƀফ", "ইউসুফ"],
  ["ăাইভার", "ড্রাইভার"],
  ["ছাēার", "ছাত্তার"],
  ["সাēার", "সাত্তার"],
  ["ÙিĔয়", "ক্ষত্রিয়"],
  ["Ïজাসনা", "জোসনা"],
  ["Ïমাশারফ", "মোশারফ"],
  ["Ïরািজনা", "রোজিনা"],
  ["আিমƁল", "আমিরুল"],
  ["জিহƁল", "জহিরুল"],
  ["Ïসাহরাব", "সোহরাব"],
  ["Ïসিলম", "সেলিম"],
  ["Ïমাবারক", "মোবারক"],
  ["Ïগৗরীপুর", "গৌরীপুর"],
  ["Ïসিলনা", "সেলিনা"],
  ["Ïসােহল", "সোহেল"],
  ["Ïরেহনা", "রেহেনা"],
  ["Ïহনা", "হেনা"],
  ["Ïখারেশদ", "খোরশেদ"],
  ["Ïহাসাইন", "হোসাইন"],
  ["Ïমাসেলম", "মোসলেম"],
  ["Ïকাকরাইল", "কোকরাইল"],
  ["Ïরািকয়া", "রোকিয়া"],
  ["Ïলাকমান", "লোকমান"],
  ["Ïগাপীনাথপুর", "গোপীনাথপুর"],
  ["Ïজেলখা", "জেলেখা"],
  ["Ïদ", "দে"],
  ["পিŔম", "পশ্চিম"],
  ["িবśাস", "বিশ্বাস"],
  ["িবśিজৎ", "বিশ্বজিৎ"],
  ["কŐনা", "কল্পনা"],
  ["িশŐী", "শিল্পী"],
  ["আিছম", "আছিম"],
  ["িততার", "তিতার"],
  ["গৃিহনী", "গৃহিণী"],
  ["বািলয়ান", "বালিয়ান"],
  ["পুিটজানা", "পুটিজানা"],
  ["এনােয়তপুর", "এনায়েতপুর"],
  ["রাংগামািটয়া", "রাঙ্গামাটিয়া"],
  ["ময়মনিসংহ", "ময়মনসিংহ"],
  ["দিনমজুর", "দিনমজুর"],
  ["িদনমজুর", "দিনমজুর"],
  ["বঁাশদী", "বাঁশদী"],
  ["বঁাশিদ", "বাঁশিদ"],
  ["বাশঁদী", "বাঁশদী"],
  ["বাশঁিদ", "বাঁশিদ"],
  ["ছােহরা", "ছাহেরা"],
  ["হািছনা", "হাছিনা"],
  ["হািলমা", "হালিমা"],
  ["হািমদা", "হামিদা"],
  ["হািববুর", "হাবিবুর"],
  ["রািবয়া", "রাবিয়া"],
  ["রািশদা", "রাশিদা"],
  ["রািজয়া", "রাজিয়া"],
  ["খািদজা", "খাদিজা"],
  ["জােমলা", "জামেলা"],
  ["মােজদা", "মাজেদা"],
  ["আেমনা", "আমেনা"],
  ["সািদয়া", "সাদিয়া"],
  ["খাইƁন", "খাইরুন"],
  ["Ţমািহনা", "মাহিনা"],
  ["Ůĳা", "স্বপ্না"],
  ["সĳা", "স্বপ্না"],
  ["Ƃপা", "রুপা"],
  ["Ƃপালী", "রুপালী"],
  ["Ƃপজান", "রুপজান"],
  ["অংশ)বালাśর", "অংশ)বালাশ্বর"],
  ["ইĽাহিম", "ইব্রাহিম"],
  ["রুƎম", "রুস্তম"],
  ["রƎম", "রুস্তম"],
  ["রোƎম", "রোস্তম"],
  ["মোƎফা", "মোস্তফা"],
  ["আÑাছ", "আক্কাছ"],
  ["আÑাস", "আক্কাস"],
  ["আবুবÑর", "আবুবক্কর"],
  ["বÑর", "বক্কর"],
  ["শুÑুরী", "শুকুরী"],
  ["শুÑুর", "শুকুর"],
  ["শুÑুরি", "শুকুরি"],
  ["শুÑুরজান", "শুকুরজান"],
  ["সুÑুরী", "সুকুরী"],
  ["টুিÑর", "টুকির"],
  ["টুিÑরপাড়", "টুকিরপাড়"],
  ["টুিÑরপাড়া", "টুকিরপাড়া"],
  ["মোজাফর", "মোজাফফর"],
  ["চØবত্রী", "চক্রবর্তী"],
  ["চØবত্ত্রী", "চক্রবর্তী"],
  ["মćল", "মণ্ডল"],
  ["পূবÎ", "পূর্ব"],
  ["আলহাú", "আলহাজ"],
  ["রĐা", "রত্না"],
  ["রďা", "রত্না"],
  ["মোছা◌্◌ঃ", "মোছাঃ"],
  ["মোছা◌াঃ", "মোছাঃ"],
  ["কু◌্শমাইল", "কুশমাইল"],
  ["সংলá", "সংলগ্ন"],
  ["Ĵভা", "প্রভা"],
  ["Ĵিতমা", "প্রতিমা"],
  ["Ĵবাসী", "প্রবাসী"],
  ["Ĵহরী", "প্রহরী"],
  ["Ĵবসী", "প্রবাসী"],
  ["ƣমার", "কুমার"],
  ["আļাস", "আব্বাস"],
  ["জļার", "জব্বার"],
  ["রļানী", "রব্বানী"],
  ["ইিýিনয়ার", "ইঞ্জিনিয়ার"],
  ["যুিধিşর", "যুধিষ্ঠির"],
  ["শিমÎşা", "শর্মিষ্ঠা"],
  ["কাşগড়া", "কাষ্ঠগড়া"],
  ["বাyতা", "বাক্তা"],
  ["আyĤ", "আকন্দ"],
  ["আyন্দ", "আকন্দ"],
  ["আyতার", "আক্তার"],
  ["আzতার", "আক্তার"],
  ["yƃস", "কদ্দুছ"],
  ["yėুছ", "কদ্দুছ"],
]);

const OCCUPATION_OVERRIDES = new Map([
  ["গৃিহনী", "গৃহিণী"],
  ["ছাĔ/ছাĔী", "ছাত্র/ছাত্রী"],
  ["Řিমক", "শ্রমিক"],
  ["বËবসা", "ব্যবসা"],
  ["Ïবসরকারী চাƣরী", "বেসরকারী চাকুরী"],
  ["Ïবকার", "বেকার"],
  ["িদনমজুর", "দিনমজুর"],
  ["িশÙক", "শিক্ষক"],
  ["িমűী", "মিস্ত্রী"],
  ["সরকারী চাƣরী", "সরকারী চাকুরী"],
  ["ăাইভার", "ড্রাইভার"],
  ["দিজÎ", "দর্জি"],
  ["অįাį", "অন্যান্য"],
  ["িরÔা/ভËান চালক", "রিকশা/ভ্যান চালক"],
  ["গৃহকমÎী", "গৃহকর্মী"],
  ["ইমাম/পুেরািহত/পাęী", "ইমাম/পুরোহিত/পাদ্রী"],
  ["ডা×ার", "ডাক্তার"],
  ["Ïজেল", "জেলে"],
  ["Ĵবাসী", "প্রবাসী"],
  ["ইিýিনয়ার", "ইঞ্জিনিয়ার"],
  ["ƣমার", "কুমার"],
  ["বËাংকার", "ব্যাংকার"],
  ["বাবুচÎী", "বাবুর্চী"],
  ["অবসরĴাİ সরকারী চাƣরী", "অবসরপ্রাপ্ত সরকারী চাকুরী"],
  ["Ĵহরী", "প্রহরী"],
  ["অবসরĴাİ Ïবসরকারী চাƣরী", "অবসরপ্রাপ্ত বেসরকারী চাকুরী"],
  ["কĀাÒর", "কন্ট্রাক্টর"],
  ["ŮণÎকার", "স্বর্ণকার"],
  ["বাবুÎচী", "বাবুর্চী"],
  ["আইনজীিব", "আইনজীবী"],
  ["পিরïĨকমÎী", "পরিচ্ছন্নকর্মী"],
  ["Ïসিবকা", "সেবিকা"],
  ["নাসÎ", "নার্স"],
  ["রাজিমűী", "রাজমিস্ত্রী"],
  ["ছাĔ", "ছাত্র"],
  ["ƣিল", "কুলি"],
  ["চাƣরী", "চাকুরী"],
  ["Ïহিকম/কিবরাজ", "হেকিম/কবিরাজ"],
  ["মাęাসা", "মাদ্রাসা"],
  ["ĴিতবĦী", "প্রতিবন্ধী"],
  ["িভÙুক", "ভিক্ষুক"],
  ["গােমÎĩ", "গার্মেন্টস"],
  ["গাড়ীর Ïহলপার", "গাড়ীর হেলপার"],
  ["ভËান চালক", "ভ্যান চালক"],
  ["Ĵাবাসী", "প্রবাসী"],
  ["Ïবসরকাির চাকরী", "বেসরকারী চাকুরী"],
  ["গােমÎĩ কমÎী", "গার্মেন্টস কর্মী"],
  ["বËবসায়ী", "ব্যবসায়ী"],
  ["িভÙাবৃিē", "ভিক্ষাবৃত্তি"],
  ["ফািনÎচার", "ফার্নিচার"],
  ["গােমÎটস কমÎী", "গার্মেন্টস কর্মী"],
  ["কাঠিমűী", "কাঠমিস্ত্রী"],
  ["িশÙাথÎী", "শিক্ষার্থী"],
  ["Ïমকািনক", "মেকানিক"],
  ["কাঠিমিű", "কাঠমিস্ত্রী"],
  ["যবসা", "ব্যবসা"],
  ["ÏটইলাসÎ", "টেইলার্স"],
  ["মাęাসার িশÙক", "মাদ্রাসার শিক্ষক"],
  ["কমÎজীিব", "কর্মজীবী"],
  ["Ĵবসী", "প্রবাসী"],
  ["মৎų জীিব", "মৎস্য জীবী"],
  ["কাঠ িমিű", "কাঠ মিস্ত্রী"],
  ["অſবাদক", "অনুবাদক"],
  ["িশÙকতা", "শিক্ষকতা"],
  ["ইেলকিĀক িমűী", "ইলেকট্রিক মিস্ত্রী"],
  ["ÏমকািনÔ", "মেকানিক্স"],
  ["Ïমিরন ইিýিনয়ার", "মেরিন ইঞ্জিনিয়ার"],
  ["Ïসনা সদų", "সেনা সদস্য"],
  ["Ïসিবকা", "সেবিকা"],
  ["Ïব.চাƣরী", "বে. চাকুরী"],
  ["Ïব. চাকরী", "বে. চাকুরী"],
  ["কওমী মাęাসার ছাĔ", "কওমী মাদ্রাসার ছাত্র"],
]);

const PRE_BASE_VOWEL_REGEX = /^([িেৈ])([ক-হড়ঢ়য়](?:্[ক-হড়ঢ়য়])*)/u;
const INTERNAL_PRE_BASE_VOWEL_REGEX =
  /([অআইঈউঊঋএঐওঔািীুূৃেৈোৌৗঁঃ])([িেৈ])([ক-হড়ঢ়য়](?:্[ক-হড়ঢ়য়])*)/gu;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeWhitespace(value) {
  return String(value).replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}

function splitToken(token) {
  const leading = token.match(/^[([{"'“‘]+/u)?.[0] ?? "";
  const trailing = token.match(/[)\]},"'”’.:;!?-]+$/u)?.[0] ?? "";
  return {
    leading,
    core: token.slice(leading.length, trailing ? token.length - trailing.length : token.length),
    trailing,
  };
}

function replaceSuspiciousChars(value) {
  let output = "";
  for (const character of value) {
    output += CHAR_REPLACEMENTS.get(character) ?? character;
  }
  return output;
}

function cleanupBrokenMarks(value) {
  return value
    .replace(/◌/gu, "")
    .replace(/([অআইঈউঊঋএঐওঔআািীুূৃেৈোৌৗঁঃ])্(?=[ক-হড়ঢ়য়])/gu, "$1")
    .replace(/([ািীুূৃেৈোৌৗঃ])\1+/gu, "$1")
    .replace(/িা/gu, "ি")
    .replace(/ুা/gu, "ু")
    .replace(/ঃঃ/gu, "ঃ");
}

const TEXT_REPLACEMENTS = [
  [/\u09A8\u09BE\u09B8\u09BF\u09B0\u09A8/gu, "\u09A8\u09BE\u09B8\u09B0\u09BF\u09A8"],
  [/\u09A8\u09BE\u099B\u09BF\u09B0\u09A8/gu, "\u09A8\u09BE\u099B\u09B0\u09BF\u09A8"],
  [/\u09A8\u09BE\u09B8\u09B0\u09C0\u09A8/gu, "\u09A8\u09BE\u09B8\u09B0\u09BF\u09A8"],
  [/\u09A8\u09BE\u099B\u09B0\u09C0\u09A8/gu, "\u09A8\u09BE\u099B\u09B0\u09BF\u09A8"],
  [/গোবিƏপর/gu, "গোবিন্দপুর"],
  [/ইƏভূষণ/gu, "ইন্দুভূষণ"],
  [/ইƏির/gu, "ইন্দির"],
  [/ইƏরী/gu, "ইন্দুরী"],
  [/সুধেƏ/gu, "সুধেন্দু"],
  [/অমেলƏ/gu, "অমলেন্দু"],
  [/কমেলƏ/gu, "কমলেন্দু"],
  [/জগবƏ/gu, "জগবন্ধু"],
  [/দীনবƏ/gu, "দীনবন্ধু"],
  [/হিƏপাড়া/gu, "হিন্দুপাড়া"],
  [/হিƏবাড়ী/gu, "হিন্দুবাড়ী"],
  [/হিƏবাড়ি/gu, "হিন্দুবাড়ি"],
  [/হেƏরী/gu, "হেন্দুরী"],
  [/হেƏির/gu, "হেন্দুরি"],
  [/হিƏরী/gu, "হিন্দুরী"],
  [/হিƏির/gu, "হিন্দুরি"],
  [/সুƏরী/gu, "সুন্দরী"],
  [/সুƏর/gu, "সুন্দর"],
  [/সিƏরানী/gu, "সিন্দুরানী"],
  [/সিƏরী/gu, "সিন্দুরী"],
  [/কাƏরী/gu, "কন্দুরী"],
  [/কাƏির/gu, "কন্দুরি"],
  [/গেƏয়া/gu, "গেন্দুয়া"],
  [/হিƏর/gu, "হিন্দুর"],
  [/বিƏর/gu, "বিন্দুর"],
  [/গেƏ/gu, "গেন্দু"],
  [/হিƏ/gu, "হিন্দু"],
  [/বিƏ/gu, "বিন্দু"],
  [/সিƏ/gu, "সিন্দু"],
  [/চাƏ/gu, "চান্দু"],
  [/কাƏ/gu, "কন্দু"],
  [/বাƏ/gu, "বান্দু"],
  [/বƏ/gu, "বন্ধু"],
  [/ইƏ/gu, "ইন্দু"],
  [/zতুন/gu, "খাতুন"],
  [/বyস/gu, "বক্স"],
  [/বzশ/gu, "বকশ"],
  [/চy(?=\s*দেওগা)/gu, "চক"],
  [/আyদ/gu, "আকন্দ"],
  [/আyবর/gu, "আকবর"],
  [/মyবুল/gu, "মকবুল"],
  [/মাyসুদা/gu, "মাসুদা"],
  [/শিyদার/gu, "শিকদার"],
  [/মুেyছদ/gu, "মোকেছদ"],
  [/yদুস/gu, "কদ্দুছ"],
  [/yদ্দুছ/gu, "কদ্দুছ"],
  [/yদ্দুস/gu, "কদ্দুস"],
  [/yদ্দ/gu, "কদ্দ"],
  [/yন্দ/gu, "কন্দ"],
  [/y\s*তার/gu, "ক্তার"],
  [/yতা/gu, "ক্তা"],
  [/z\s*তার/gu, "ক্তার"],
  [/zতা/gu, "ক্তা"],
];

function applyTextReplacements(value) {
  let output = value;

  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

function reorderBrokenVowels(value) {
  let output = value;

  for (let index = 0; index < 6; index += 1) {
    const next = output
      .replace(PRE_BASE_VOWEL_REGEX, "$2$1")
      .replace(INTERNAL_PRE_BASE_VOWEL_REGEX, "$1$3$2")
      .replace(/ো/g, "ো")
      .replace(/াে/g, "ো")
      .replace(/ৌ/g, "ৌ")
      .replace(/াৗ/g, "ৌ")
      .replace(/ঁা/g, "াঁ");

    if (next === output) {
      break;
    }

    output = next;
  }

  return output;
}

function normalizeTokenCore(core, fieldName) {
  if (!core) return core;

  if (fieldName === "occupation_raw" && OCCUPATION_OVERRIDES.has(core)) {
    return OCCUPATION_OVERRIDES.get(core);
  }

  if (TOKEN_OVERRIDES.has(core)) {
    return TOKEN_OVERRIDES.get(core);
  }

  let output = core;
  output = replaceSuspiciousChars(output);
  output = cleanupBrokenMarks(output);
  output = reorderBrokenVowels(output);

  if (fieldName === "occupation_raw" && OCCUPATION_OVERRIDES.has(output)) {
    output = OCCUPATION_OVERRIDES.get(output);
  }

  if (TOKEN_OVERRIDES.has(output)) {
    output = TOKEN_OVERRIDES.get(output);
  }

  return output;
}

function normalizeTextValue(value, fieldName) {
  if (typeof value !== "string") return value;

  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return trimmed;

  if (fieldName === "occupation_raw" && OCCUPATION_OVERRIDES.has(trimmed)) {
    return OCCUPATION_OVERRIDES.get(trimmed);
  }

  const parts = trimmed.split(/(\s+)/);
  const normalized = parts
    .map((part) => {
      if (!part || /^\s+$/u.test(part)) return part;

      const { leading, core, trailing } = splitToken(part);
      const nextCore = normalizeTokenCore(core, fieldName);
      return `${leading}${nextCore}${trailing}`;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = applyTextReplacements(cleanupBrokenMarks(normalized));

  if (fieldName === "occupation_raw" && OCCUPATION_OVERRIDES.has(cleaned)) {
    return OCCUPATION_OVERRIDES.get(cleaned);
  }

  return cleaned;
}

function normalizeDocument(document, fields, stats) {
  const normalized = { ...document };
  let changed = false;

  for (const fieldName of fields) {
    if (typeof normalized[fieldName] !== "string") {
      continue;
    }

    const before = normalized[fieldName];
    const after = normalizeTextValue(before, fieldName);

    if (before !== after) {
      normalized[fieldName] = after;
      changed = true;
      stats.changed_fields += 1;
    }

    if (SUSPICIOUS_CHAR_PATTERN.test(after)) {
      stats.residual_suspicious_fields += 1;
    }
  }

  if (changed) {
    stats.changed_documents += 1;
  }

  return normalized;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeSmallCollection(inputFileName, outputBaseName, fields, stats) {
  const inputPath = path.join(INPUT_DIR, inputFileName);
  const outputJsonPath = path.join(OUTPUT_DIR, `${outputBaseName}.json`);
  const outputNdjsonPath = path.join(OUTPUT_DIR, `${outputBaseName}.ndjson`);
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const normalizedItems = Array.isArray(parsed)
    ? parsed.map((item) => normalizeDocument(item, fields, stats))
    : normalizeDocument(parsed, fields, stats);

  writeJson(outputJsonPath, normalizedItems);

  if (Array.isArray(normalizedItems)) {
    fs.writeFileSync(outputNdjsonPath, normalizedItems.map((item) => JSON.stringify(item)).join("\n"), "utf8");
  }
}

async function normalizeVoters(stats) {
  const inputPath = path.join(INPUT_DIR, "voters.ndjson");
  const outputNdjsonPath = path.join(OUTPUT_DIR, "voters.ndjson");
  const outputJsonPath = path.join(OUTPUT_DIR, "voters.json");

  const reader = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const ndjsonWriter = fs.createWriteStream(outputNdjsonPath, { encoding: "utf8" });
  const jsonWriter = fs.createWriteStream(outputJsonPath, { encoding: "utf8" });

  let index = 0;
  jsonWriter.write("[\n");

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = JSON.parse(trimmed);
    const normalized = normalizeDocument(parsed, VOTER_TEXT_FIELDS, stats);
    const serialized = JSON.stringify(normalized);

    ndjsonWriter.write(`${serialized}\n`);
    jsonWriter.write(`${index === 0 ? "" : ",\n"}${serialized}`);

    index += 1;
    stats.total_voters = index;

    if (index % 50000 === 0) {
      console.log(`Normalized voters: ${index}`);
    }
  }

  jsonWriter.write("\n]\n");

  await Promise.all([
    new Promise((resolve) => ndjsonWriter.end(resolve)),
    new Promise((resolve) => jsonWriter.end(resolve)),
  ]);
}

async function main() {
  if (!fs.existsSync(path.join(INPUT_DIR, "voters.ndjson"))) {
    throw new Error(`Input voters file not found in ${INPUT_DIR}`);
  }

  ensureDir(OUTPUT_DIR);

  const stats = {
    input_dir: INPUT_DIR,
    output_dir: OUTPUT_DIR,
    changed_documents: 0,
    changed_fields: 0,
    residual_suspicious_fields: 0,
    total_voters: 0,
  };

  console.log(`Normalizing voter data from ${INPUT_DIR}`);
  console.log(`Writing normalized files to ${OUTPUT_DIR}`);

  await normalizeVoters(stats);
  normalizeSmallCollection("areas.json", "areas", AREA_TEXT_FIELDS, stats);
  normalizeSmallCollection("source-files.json", "source-files", SOURCE_FILE_TEXT_FIELDS, stats);

  const summary = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, "summary.json"), "utf8"));
  summary.normalization = {
    version: "2026-04-01-v5",
    normalized_at: new Date().toISOString(),
    changed_documents: stats.changed_documents,
    changed_fields: stats.changed_fields,
    residual_suspicious_fields: stats.residual_suspicious_fields,
    total_voters: stats.total_voters,
  };

  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);

  console.log("Normalization complete.");
  console.log(JSON.stringify(summary.normalization, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
