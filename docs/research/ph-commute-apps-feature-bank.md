# Philippine commute apps: feature bank

Checked 2026-09-14

**What this is.** This file looks at Philippine commute and transit apps. It collects their features into one "feature bank", with notes on whether each one suits ParaPo.

**How to read it.**

- Part 1 describes each app briefly. Part 2 covers the name check.
- Part 3 is the feature bank. Every feature has an ID like **F07**, so you can search for it later.
- ✅ = fits our decisions · ⚠️ = partly fits · ❌ = conflicts (for now).
- Effort is for one person. **S** = days, **M** = a week or two, **L** = a month or more.
- **Unverified** means we could not confirm it from the app's own pages or an official source. The reason is given each time.

**How this was checked.**

- Official websites, app store listings and official announcements came first.
- SakayCDO was loaded in a headless browser (a browser run by a script, with no window). We call that "first-hand inspection of the live site, 2026-09-14".
- News articles are used only where nothing better existed. They are marked *secondary*.
- Some pages were read through a tool that summarises pages, so short quotes may be slightly reworded. Re-check the source before quoting publicly.

## Contents

1. [Part 1 — The apps](#part-1--the-apps)
2. [Part 2 — Name check: "ParaPo"](#part-2--name-check-parapo)
3. [Part 3 — Feature bank](#part-3--feature-bank)
4. [Part 4 — Shortlist](#part-4--shortlist)
5. [Part 5 — Glossary in simple words](#part-5--glossary-in-simple-words)
6. [Part 6 — Sources](#part-6--sources)

---

## Part 1 — The apps

| App | What it is | Area | Web / Android / iOS | Live data? |
|---|---|---|---|---|
| [SakayCDO](#sakaycdo) | Jeepney route map with trip ideas | Cagayan de Oro | Web | No |
| [Sakay.ph](#sakayph) | Commute directions for all modes | Metro Manila (+ a few regions) | Web, Android, iOS | EDSA Carousel buses only (per its FAQ) |
| [TrainSight](#trainsight) | Live train tracker | LRT-1, LRT-2, MRT-3 | Web, Android (iOS "soon") | Yes |
| [ikotMNL](#ikotmnl) | Official LRT-1 app (LRT-2 added) | LRT-1, LRT-2 | iOS (Android link broken) | Yes (arrivals, crowding) |
| [Moovit](#moovit) | Worldwide transit app | Metro Manila among many cities | Web, Android, iOS | Only where operators share GPS |
| [Google Maps](#google-maps) | General maps with transit directions | Worldwide; PH trains and some buses | Web, Android, iOS | Only where available |
| [beep™ app](#beep-app) | Transit card balance and loading | LRT/MRT, some buses | Android, iOS, Huawei | No (payments) |
| [TRENLigtas](#trenligtas) | Live train map | LRT-1, LRT-2, MRT-3 | Web | Predictions + community reports |
| [Davao Commuters](#davao-commuters) | Bus tracking + jeepney routes | Davao City | iOS | Yes (DIBS buses) |
| [JeepTa](#jeepta) | Jeepney route guide | Davao City | Web | Claimed in title, not seen |
| [i-Jeepney](#i-jeepney) | Live jeepney tracker | Iligan City | Web | Claimed |
| [Mandaue Commuter Transport Map](#mandaue-commuter-transport-map) | City bus and jeep tracker | Mandaue City, Cebu | Web | Yes (per news) |

Smaller or unconfirmed finds are in [Also checked](#also-checked).

### SakayCDO

- **What it is:** A website that shows Cagayan de Oro's jeepney routes on a map. You set a From point and a To point, and it suggests which jeepney (or jeepneys) to ride.
- **Who runs it:** Not stated. The page's author tag just says "SakayCDO". Its canonical link (the address the site calls its main one) is sakaycdo.com, which did not load on 2026-09-14.
- **Where it lives:** Web only (hosted on Vercel).
- **Coverage:** Cagayan de Oro. The route panel says "76 route options available".
- **Data source:** Not stated. There are no credits, disclaimer or accuracy notes on the page.
  - **Unverified:** the site's code contains a leftover link to a local WordPress address. This *may* mean the routes are managed in WordPress, but we could not confirm it.
- **Built with (seen in the live page and its code):**
  - Next.js and the Leaflet map library.
  - OpenStreetMap's standard raster tiles from tile.openstreetmap.org.
  - Nominatim for place search and reverse geocoding, with a country filter.
  - The code also calls Photon (photon.komoot.io, another OpenStreetMap place search).
  - It also calls the public OSRM demo router (router.project-osrm.org) with driving and walking profiles.
- **Notable features:**
  - "Browse jeepney routes" list. "Tip: Filters are optional. You can directly pick any route from the list."
  - From and To text boxes with place suggestions. "Pin From" / "Pin To" set points by tapping the map. "Swap pins" and "Clear pins".
  - "Locate me" shows your position.
  - Trip plan: "Set both From and To pins to find the best 1-jeepney route." The code also has the labels "No transfer needed", "Best transfer route (2 jeepneys)", "Best transfer route (3 jeepneys)", "Nearest drop-off" and "Estimated walk".
  - "Show all routes on map" and "Clear selected route". "Pick a route option to preview its path and direction."
  - Route lines load only when needed: "Will load when this route is selected."
  - Map legend. Routes: Inbound route, Outbound route, 1st Jeep, 2nd Jeep, 3rd Jeep. Pins: From pin, To pin, Your location, Drop-off.
  - Routes are split into inbound and outbound. Some route names include the loop length, e.g. "(69.0km Roundtrip)".
- **Policy notes if ParaPo copies it:**
  - *OSM tiles:* no service guarantee, access can be blocked without notice, and "Offline use is not permitted on tile.openstreetmap.org". Bulk or pre-emptive downloading is forbidden.
  - *Nominatim:* an absolute maximum of 1 request per second. You must not build autocomplete (search-as-you-type) on it from the browser. Results must be cached on your side, and attribution is required. The policy may change without notice, and access can be withdrawn.
  - *OSRM demo server:* "Do not exceed 1 request per second". It is for "reasonable, non-commercial use-cases" and gives "no guarantees wrt. uptime, latency, or data updates".
  - *Photon:* "please be fair - extensive usage will be throttled", and "We do not guarantee for the availability".
- **Sources:** first-hand inspection of the live site, 2026-09-14; policy pages listed in [Sources](#sakaycdo-sources).

### Sakay.ph

- **What it is:** Metro Manila's best-known commute directions app. You type where you are and where you're going. It shows which jeepneys, buses, trains or ferries to take, step by step, with fares.
- **Who runs it:** By Implication, Inc. This is the App Store seller name. The Google Play developer is "By Implication", and the site footer says "Lovingly crafted, By Implication."
  - Bonito Tech's own site says "We design, build and maintain Sakay".
  - **Unverified (secondary only):** Wikipedia says By Implication is now called Bonito Tech and that Sakay.ph launched in 2013.
- **Where it lives:** Web (sakay.ph), Android (500K+ downloads, updated 7 Sep 2026), iOS.
- **Coverage:**
  - Its FAQ says: "Metro Manila and surrounding areas", plus "a few regions" whose routes are "still super new".
  - The P2P bus schedules also include long trips such as Baguio–PITX and Clark Airport–NAIA.
- **Modes:**
  - Google Play lists jeepneys, regular and P2P buses, MRT3, LRT1, LRT2 and PNR trains, UV Express, Comet eJeeps and the Pasig River Ferry.
  - The website also lists Libreng Sakay (free rides).
  - Tricycles are "in beta" (FAQ).
- **Data source:**
  - "Most comprehensive, crowd-sourced route database" and "Always updated with real commuter insights" (Play listing).
  - "Sakay.ph collects the best commuting data available" (About page).
  - Route Explorer pages show an operator line such as "Operated by LTFRB (PUB)". Route IDs start with "DOTR:".
- **Public data release:** [github.com/sakayph/gtfs](https://github.com/sakayph/gtfs).
  - It describes itself as "a GTFS feed containing jeepney, bus, and train data for Metro Manila", released through the Philippine Transit App Challenge.
  - The `dotc` branch holds the original DOTC data. `master` holds Sakay's edits.
  - Commits run from 2 Feb 2014 to 24 Mar 2015. Examples: "Assume more frequent jeep arrival times" and "Extend schedules up to 2020".
  - Its LICENSE.md is a DOTC developer licence, **not an open licence**. DOTC owns all rights in the data. You can't sell the data on its own or claim DOTC endorsement, and DOTC can end your access.
- **Notable features:**
  - A-to-B directions. "Compare routes by travel time and cost".
  - Tap a ride leg to see other routes that also work for that leg (FAQ).
  - Results depend on departure time: "There are fewer routes available late at night and early morning" (FAQ).
  - **Route Explorer** (explore.sakay.ph) shows, for each route:
    - The operator and the two end points.
    - The fare rule. For the EDSA Carousel: "PHP 15.00 for the first 5 kilometers", "PHP 2.65 for every succeeding kilometer".
    - The schedule ("This route is operational 24 hours").
    - The stops in order, with Pick-up and Drop-off columns.
    - A **"Report Issue"** button on each section.
  - **P2P schedules** (p2p.sakay.ph) list each route with its operator (e.g. "c/o RRCG Transport"). Weekday, Saturday and Sunday variants are listed separately.
  - **Place Finder** (placefinder.sakay.ph) is a directory of malls, terminals, schools and other places, grouped by city.
  - **Tracker** (tracker.sakay.ph, titled "Bus and Jeepney Live Location Tracker").
    - FAQ: "We only track buses along EDSA Carousel Busway. Drivers have to be online for you to see their live locations."
    - The FAQ was first posted 28 Feb 2019 and edited since. The current scope is **Unverified** because the tracker page loads by script.
  - Stop rules (FAQ):
    - Pick-up and drop-off points are set "about 100m apart".
    - Sheds and busy walkways are preferred.
    - Stops with "no loading/unloading" signs were removed.
  - It uses official route names, not signboards. The FAQ explains that signboards are informal.
  - Offline (FAQ): "We don't have a full offline mode". The app does save your most recent search, so you can view it offline.
  - Feedback goes through the app or feedback@sakay.ph. People report wrong fares, route cutting (jeeps turning back early) and missing places.
  - Sign in with Google and trip history (App Store "What's New").
  - "Kaakbay" donations through GCash.
  - Business side (/partner): transport management system, payments and ticketing, booking, "Urban Mobility Intelligence", and advertising.
  - Homepage code (first-hand look, 2026-09-14) references Stadia Maps tiles, the ArcGIS geocoder, and a Photon place-search server on its own domain (photon.sakay.ph).
  - **Unverified:** a Play Store review quoted on sakay.ph mentions downloading the map for offline use and a "halfway" meet-up feature. The FAQ contradicts the offline part.

### TrainSight

- **What it is:** A live map of Metro Manila trains. It shows where trains are (live or predicted) and when they may reach a station.
  - News (secondary) says the founder was inspired by FlightRadar24, a live plane-tracking site.
- **Who runs it:** Rhey Jen (RJ) Crusem, "founder of InSight Transportation Tech Inc." (Play listing).
  - The listing says it "is not an official application of any railway operator or government agency".
- **Where it lives:**
  - Android: Google Play, updated 29 Aug 2026, 100+ downloads.
  - Web app: rail.trainsight.app.
  - iOS and Huawei AppGallery: "Soon to come" (download page).
- **Coverage:** LRT-1, LRT-2, MRT-3. News (secondary) says it has a "provision for MRT-7".
- **Data source (Play listing):**
  - "dedicated tracking infrastructure".
  - Optional "community tracking" using "permission-based location and motion information". This "may continue transmitting movement observations during your railway journey while the app is not on screen".
  - The web app also shows "Predicted trains based on LRT/MRT timetables".
  - News (secondary) says hardware trackers will be installed on trains.
- **Notable features:**
  - Live and predicted train positions, estimated arrivals and upcoming stations. You can follow trains in either direction.
  - "system alerts and service disruption updates".
  - "Access essential train information without creating an account."
  - Arrival and departure alerts on a schedule you set. Favourite stations. Sound, voice and vibration alerts.
  - Settings: station name labels on or off, "low graphics mode", and six languages (English, Filipino, Japanese, Korean, Chinese, Spanish).
  - "crowd density insights" (About page).
  - Web app privacy line: "Your personal location data is never stored in our database."
  - Accuracy warning: train locations and arrival times "are estimates", and riders should "Always follow official announcements, station signage, and instructions from railway personnel".
  - Donations via Ko-fi and GCash.
  - trainsight.app advertises an "Open API". An API is a way for other programs to fetch its data.

### ikotMNL

- **What it is:** The official app of LRT-1's operator. It covers train arrivals, crowding at stations, tickets and news.
- **Who runs it:** Light Rail Manila Corporation (LRMC), the App Store seller.
  - LRMC and the Light Rail Transit Authority (LRTA) agreed to add LRT-2. This was announced 17 Dec 2020.
- **Where it lives:**
  - iOS: the App Store page showed version 3.0.5 ("Maintenance Fixes") with a 2024 date.
  - Android: LRMC's page links to a Google Play listing that returned "Not Found" on 2026-09-14. Android availability is **Unverified**.
- **Coverage:** LRT-1 and LRT-2. It launched in November 2019.
- **Data source:** The operator's own systems (not described).
- **Notable features:**
  - Buy LRT-1 tickets.
  - Real-time LRT-1 and LRT-2 arrivals and departures, and crowd monitoring per station.
  - Fare information.
  - A built-in trip planner that uses Sakay.ph.
  - Nearby restaurants, museums, churches and malls.
  - News and passenger advisories, a customer-service chat and a feedback form.
  - Bluetooth contact tracing (added in 2020).

### Moovit

- **What it is:** A worldwide public transport app with a Metro Manila section.
- **Who runs it:** Moovit (Google Play developer name).
- **Where it lives:** Web, Android (100M+ downloads, updated 10 Sep 2026), iOS.
- **Coverage (partly verified):** Moovit's own Manila pages blocked automated loading (HTTP 403) on 2026-09-14. What follows is their text as shown in search results.
  - They list agencies including MRTC, LRTA, PNR, LTFRB, BGC Bus, P2P and UV Express.
  - Jeepney lines are filed under "LTFRB", with stop lists.
  - One page says LTFRB has "888 bus routes in Manila with 4840 bus stops". **Unverified**; the source of these numbers is not stated.
- **Data source:** Not stated for Manila. Globally (Play listing):
  - Real-time arrivals come "directly from GPS devices positioned on buses and trains", where operators provide them.
  - The "user community actively reports issues".
  - Its pages link to a community editor (editor.moovitapp.com).
- **Notable features (worldwide, Play listing):**
  - Trip planning across modes, real-time arrivals where available, and service alerts.
  - Live navigation with "get-off alerts".
  - An "Augmented Reality Way Finder" to find your stop.
  - Favourites.
  - Ticket payments "in supported metro areas".
  - **Unverified for Manila:** offline PDF maps and "Moovit Pay". These appear only in search snippets of Moovit pages.

### Google Maps

- **What it is:** Google's map app. It can give public transport directions.
- **Who runs it:** Google.
- **Where it lives:** Web, Android, iOS.
- **Coverage in the Philippines:**
  - Google's "About Google Transit" partner page does not list any Philippine agency.
  - EACOMM, a Quezon City software company that did the data work, says it added data to Google Maps:
    - MRT, LRT1, LRT2 and PNR trains.
    - 20+ Metro Manila bus routes and 20+ intercity bus routes.
    - 3 ferry routes.
  - EACOMM's post does not mention jeepneys. **Unverified:** jeepney directions in Google Maps for Metro Manila (only blogs and news say so).
- **Data source:** Transit agencies or partners share route and schedule files (GTFS) with Google. Live updates are optional ("Realtime Transit").
- **Notable features (Google Help, worldwide):**
  - Departures: "Some transit stations show real-time departures while others show a schedule of departures."
  - Colour codes for on time, early and delayed.
  - Station crowdedness, only where data is available.
  - Delay notices.
  - Offline maps exist, but "When you're offline, transit, bicycling, or walking directions are unavailable". Offline areas also expire unless updated.
- **Note:** Bonito Tech claims Sakay's results "beat Google Maps 2-to-1". This is a maker's claim, **Unverified**.

### beep™ app

- **What it is:** The app for the beep card. The beep card is a stored-value tap card (you load money onto it) used on LRT-1, LRT-2, MRT-3 and some buses.
- **Who runs it:** beep™ (beep.com.ph).
  - **Unverified (secondary only):** news coverage names the company as AF Payments Inc. The beep pages we read did not state the company name.
- **Where it lives:** Android, iOS, Huawei AppGallery.
- **Notable features:**
  - "Real-time load balance check".
  - "Card transaction monitoring".
  - "Purchase QR ticket".
  - "Earn reward points".
  - Loading the card by holding it to an NFC phone. NFC is the short-range tap technology in many phones.
- **Relevance to ParaPo:** low. It is useful only as a "how you can pay on this route" note.

### TRENLigtas

- **What it is:** A web page by ProjectLIGTAS with a live map of Metro Manila trains.
- **Who runs it:** ProjectLIGTAS. No company details were found.
- **Where it lives:** Web (projectligtas.com/commute).
- **Coverage:** MRT-3, LRT-1, LRT-2.
- **Data source:** Predictions plus community reports: "Tap any station on the map to see live ETAs from community reports."
- **Notable features:**
  - Predicted train positions "updated every 5 seconds".
  - Fares, with the note "Fares are approximate".
  - Station info, operating hours and headway (time between trains).
  - An AI chatbot, "LigtasAI". It is labelled "hindi kapalit ng opisyal na advisory" (not a replacement for official advisories).

### Davao Commuters

- **What it is:** A Davao City commute guide app with live bus tracking.
- **Who runs it:** Neil Marc Mejia (App Store seller).
- **Where it lives:** iOS (version 2.2.0). Android was not checked.
- **Coverage:** Davao City. It has live tracking for the Davao Interim Bus System (DIBS).
- **Data source:** Not stated.
- **Notable features:**
  - Live DIBS bus tracking.
  - Stop notifications and arrival alerts.
  - Browsing jeepney and bus routes.
  - Point-to-point commute suggestions.
  - A route view with landmarks.
  - Resuming previous searches.
  - App privacy label: "The developer does not collect any data from this app."
  - Reviews ask for typing place names instead of only dropping pins.

### JeepTa

- **What it is:** A Davao City jeepney route guide website.
- **Who runs it:** Not stated on the homepage.
- **Where it lives:** Web (jeepta.online). It has a Login button.
- **Coverage:** Davao City jeepney lines, e.g. "Toril" and "Matina Crossing", plus "Route 1" to "Route 12". It says "More Routes Coming".
- **Data source:** Not stated.
  - **Unverified:** the page title says "Real-Time Jeepney Tracker for Davao City", but no live tracking showed in the homepage text.
- **Notable features:**
  - A four-step "How To Ride":
    1. Pick your start: "a barangay, landmark, or street".
    2. Choose your destination.
    3. "We'll show which jeepney code to ride, where to board, and key stops along the way".
    4. Pay the fare.
  - Each line has a base fare (₱13) and a one-line description of its corridor.
  - "Riding Tips":
    - Shout "Para!".
    - Pass your fare forward.
    - Carry exact change.
    - Check the signboard.
    - Know the peak hours.
    - Seniors and students with IDs get a 20% discount.
  - FAQ questions include "How accurate are the routes?" and "Does Jeepta track my location?".

### i-Jeepney

- **What it is:** A live jeepney tracker website for Iligan City.
- **Who runs it:** The footer mentions "Department of Philosophy, MSU-IIT". No other details were found.
- **Where it lives:** Web (i-jeepney.vercel.app). It needs no signup or download.
- **Coverage:** Iligan City ("More cities coming soon").
- **Data source:** Not stated. The features below are the landing page's claims. We did not test the live map.
- **Notable features (claimed):**
  - GPS positions updated every few seconds.
  - Arrival estimates.
  - "Hail Your Ride with Para": tap to signal an approaching driver.
  - QR payment by GCash or Maya.
  - "Verified Drivers Only", checked through LTFRB registration.
  - Free, with no account.

### Mandaue Commuter Transport Map

- **What it is:** A city-backed live map of buses and modern jeepneys in Mandaue City, Cebu.
- **Who runs it:** Good Transport Solutions, under an agreement with Mandaue City (news, secondary).
- **Where it lives:** Web. ctm.goodkredit.com now redirects to ctm.goodtransport.co, titled "Commuter Transport Map". That page loads by script, so only the title was readable.
- **Coverage:** Mandaue City.
- **Features (secondary: SunStar, 15 Nov 2024):**
  - A live map with estimated arrival times at stops.
  - Screens at bus stops (planned).
  - Voice announcements (under consideration).
  - It started with 20 buses.
  - A phone app was planned for early 2025. Its status is **Unverified**.

### Also checked

| Name | What we found | Status |
|---|---|---|
| Komyut (komyut-app.vercel.app) | Offers "AI-powered route recommendations" for jeepneys, buses, MRT/LRT and UV Express. No maker, data source or disclaimer shown. | Exists; claims unverified |
| Jeepney Routes Philippines (jeepneyroutes.xyz) | Community-added routes. Fare calculator (₱13 base, ₱1.8/km) with Regular/Student/Senior/PWD types. Disclaimer: "Please verify route information before traveling". It showed "0 Routes" when loaded. "Made by jayveescript". | Exists; almost no data |
| PH Railway Transit – MRT & LRT (iOS) | By SCRIPTREPUBLIC SOFTWARE DEVELOPMENT SERVICES. Station map, fare matrix, "live route tracking using current location", nearby attractions. Privacy label: no data collected. | Exists |
| Love Bus (Android) | By GET Philippines, Inc. Electric buses with "QR boarding & real time tracking"; aimed at inclusive rides, including PWDs. 10K+ downloads, updated 5 Mar 2026. | Exists; operator's own app |
| Chalo "Metro Manila" page (chalo.com/metromanila) | Claims live bus and jeepney tracking in Metro Manila. But its title and description mention "LCTSL" and "India's #1", so it looks like a copied template. | **Unverified** that it runs in Metro Manila |
| EDSA Busway / DOTr | No official passenger tracking app found. The PCO release of 15 Jul 2024 (new stations, 166 CCTV cameras) mentions no app or arrival screens. Sakay.ph tracks EDSA Carousel buses (Sakay FAQ). | No official app found |
| MRT-3 (DOTr) | Official site is dotrmrt3.gov.ph. The only app found was a January 2021 contact-tracing app ("MRT-3 Trace"). The DOTr page blocked automated loading, so only its title was seen. | Not a commute app; **Unverified** |
| LTFRB | No official LTFRB commuter app found. An older "Safe Ride" safety app appears only in a news article (secondary), not checked further. | **Unverified** |
| P2P bus operators | No operator-run tracking app verified. Sakay.ph publishes P2P schedules. | Not found |
| Ride-hailing (Grab, Angkas, JoyRide) | Out of scope. | — |

---

## Part 2 — Name check: "ParaPo"

**Result:** we found **no app called ParaPo or Para Po currently in the app stores.** But the name is **already used by several Philippine commute projects**. The closest clash is a Baguio jeepney navigation startup called "Para Po".

How we searched:

- Apple's public app search (Philippines and US stores) for "parapo" and "para po".
- Google Play search pages for the same.
- GitHub repository search.
- Web search.
- Loading the likely domain names directly.

| Name | What it is | Where seen | Status on 2026-09-14 |
|---|---|---|---|
| **Para Po (Baguio)** | "a jeepney-centric mobile navigation app in Baguio City". Co-founders Ryzel Erin Felizco and Carl Justin Masedman. You search a destination and it shows the jeepney line, its route and the terminal. | Start Up Podcast PH episode #199 (30 Dec 2024); Facebook page facebook.com/officialparapo | Not found in either app store search; current status unknown |
| "Davao City Jeepney Routes App - Para Po" | YouTube video by SouthBridge (@southbridgetech) | YouTube | Video exists; app status unknown |
| Para Po! (web beta) | "Find Your Way". Menus for route planning, a forum and a marketplace. Maker not stated. | parapo-beta.vercel.app | Live |
| reskydevs/parapo "ParaPo!" | "an accessibility-friendly app for Filipino commuters, designed for persons with disabilities". Built with React Native + Expo. | GitHub (created 8 Mar 2025, last push 4 Feb 2026) | Code repository |
| a-ldnstntng/para-po "Para po!" | Turns Taglish commute descriptions into route "tickets" using Gemini AI | GitHub | Code repository |
| Other GitHub repos named ParaPo | Ben010618, milk4christian, ekopinedaa, divinefavourak (no descriptions) | GitHub | Code repositories |
| PARAPO (Google Play id com.etaximo.android.clientapp.wlparapo) | Appeared in search results as a Play Store app | Google Play | Listing returns "Not Found" |
| Parapo by Hitch With Us Corp. | "Taxi booking app for safety, convenience and coupons!" Last update 8 Mar 2022 according to APKCombo (a secondary mirror site). | Google Play | Listing returns "Not Found" |
| PARA POS | A point-of-sale app (unrelated) | Apple App Store | Live |
| Parapo EHR; ParaPO (an AI research method); "parapo" on SoundCloud | Unrelated fields | app.realparapo.com; OpenReview; SoundCloud | Live |
| Roviicc/ParaPo | **This project** (it is this repo's own git remote) | GitHub | — |

**Domains** (we loaded each name; this is not a registry lookup):

- parapo.com shows "ParaPo.com is for sale | HugeDomains".
- parapo.online shows "Parked Domain name on Hostinger DNS system".
- parapo.ph answers, but shows "404 Not Found".
- parapo.com.ph answers with a redirect page; no product was seen.
- parapo.app and parapo.org gave no DNS answer. They may be unregistered, but this was not confirmed.

**Not checked:** the Philippine trademark registry (IPOPHL). "Para po" is the everyday phrase riders use to ask the driver to stop, which is likely why so many projects pick it.

---

## Part 3 — Feature bank

### At a glance

| ID | Feature | Effort | Needs first | Fits? |
|---|---|---|---|---|
| **1. Finding a route** | | | | |
| [F01](#f01--browse-a-list-of-routes) | Browse a list of routes | S | Build-order step 5 | ✅ |
| [F02](#f02--show-all-routes-or-focus-on-one) | Show all routes, or focus on one | S | Build-order step 5 | ✅ |
| [F03](#f03--which-routes-pass-here-chooser) | "Which routes pass here?" chooser | M | M14 (+M12) | ✅ |
| [F04](#f04--one-ride-finder-from-two-pins) | One-ride finder from two pins | M | M8 (+M9) | ✅ |
| [F05](#f05--route-detail-page) | Route detail page | M | M8, M11 | ✅ |
| [F06](#f06--route-variants-by-day-or-service) | Route variants (by day or service) | M | M10, M11 | ✅ |
| **2. Planning a trip** | | | | |
| [F07](#f07--a-to-b-trip-planner) | A-to-B trip planner | L | M8, M10, M12 | ⚠️ |
| [F08](#f08--transfer-suggestions-23-rides) | Transfer suggestions (2–3 rides) | L | M8, M12 | ⚠️ |
| [F09](#f09--walking-to-and-from-the-jeep) | Walking to and from the jeep | S / L | M8 | ⚠️ |
| [F10](#f10--compare-options-by-time-and-cost) | Compare options by time and cost | M / L | F07, M11 | ⚠️ |
| [F11](#f11--results-that-respect-the-time-of-day) | Results that respect the time of day | S | M11 | ✅ |
| [F12](#f12--tricycle-last-mile-zones) | Tricycle last-mile zones | L | New zone data type | ⚠️ |
| **3. Stops, terminals and fares** | | | | |
| [F13](#f13--stops-in-order-along-the-route) | Stops in order along the route | M | M8 | ✅ |
| [F14](#f14--safe-legal-boarding-points) | Safe, legal boarding points | M | M8 | ✅ |
| [F15](#f15--fare-estimate-with-the-official-fare-rule) | Fare estimate with the official fare rule | M | M8, M11 | ✅ |
| [F16](#f16--signboard-text-and-route-code-beside-the-official-name) | Signboard text beside the official name | S | M11 | ✅ |
| [F17](#f17--operating-hours-and-how-often) | Operating hours and how often | S | M11 | ✅ |
| [F18](#f18--how-you-can-pay-on-this-route) | How you can pay on this route | S | M11 | ✅ |
| **4. Live information** | | | | |
| [F19](#f19--live-vehicle-positions) | Live vehicle positions | L | Operator data + live server | ❌ |
| [F20](#f20--arrival-estimates-eta) | Arrival estimates (ETA) | L | F19 | ❌ |
| [F21](#f21--crowd-levels) | Crowd levels | L | Live data source | ❌ |
| [F22](#f22--service-notices) | Service notices | S | Build-order step 5 | ⚠️ |
| [F23](#f23--community-powered-tracking-and-reports) | Community-powered tracking and reports | L | Accounts + live server | ❌ |
| [F24](#f24--hail-the-jeep-from-your-phone) | Hail the jeep from your phone | L | F19 + accounts | ❌ |
| **5. Offline and data saving** | | | | |
| [F25](#f25--offline-map-you-can-install) | Offline map you can install | M | Build-order step 5, M15 | ✅ |
| [F26](#f26--load-route-lines-only-when-needed) | Load route lines only when needed | S–M | Build-order step 5 | ✅ |
| [F27](#f27--low-graphics-mode) | Low graphics mode | S | nothing | ✅ |
| **6. Map look and readability** | | | | |
| [F28](#f28--clear-legend) | Clear legend | S | nothing | ✅ |
| [F29](#f29--direction-shown-on-the-line) | Direction shown on the line | S | nothing | ✅ |
| [F30](#f30--name-labels-on-or-off) | Name labels on or off | S | nothing | ✅ |
| [F31](#f31--landmarks-along-the-route) | Landmarks along the route | M | Build-order step 5 | ✅ |
| [F32](#f32--rail-and-busway-stations-as-context) | Rail and busway stations as context | S–M | nothing / M12 | ✅ |
| **7. Search and places** | | | | |
| [F33](#f33--type-a-place-search-geocoding) | Type-a-place search (geocoding) | M | Self-hosted or paid geocoder | ❌ |
| [F34](#f34--search-parapos-own-places) | Search ParaPo's own places | S–M | Build-order step 5 | ✅ |
| [F35](#f35--drop-a-pin-instead-of-typing) | Drop a pin instead of typing | S | nothing | ✅ |
| [F36](#f36--locate-me-dot) | "Locate me" dot | S | Location-permission decision | ⚠️ |
| [F37](#f37--suggest-a-missing-place) | Suggest a missing place | M | Accounts, later | ❌ |
| **8. Trust and accuracy** | | | | |
| [F38](#f38--accuracy-notice-and-not-official-statement) | Accuracy notice and "not official" statement | S | nothing | ✅ |
| [F39](#f39--last-ridden-date-per-route) | "Last ridden" date per route | S | M11 | ✅ |
| [F40](#f40--credits-and-how-this-map-is-made-page) | Credits and "how this map is made" page | S | nothing | ✅ |
| [F41](#f41--be-honest-about-coverage) | Be honest about coverage | S | Build-order step 5 | ✅ |
| [F42](#f42--link-each-route-to-its-official-record) | Link each route to its official record | M | M12 | ✅ |
| [F43](#f43--ai-chat-or-ai-route-suggestions) | AI chat or AI route suggestions | M | Paid AI service + server | ❌ |
| **9. Community and contributions** | | | | |
| [F44](#f44--report-a-problem) | Report a problem | S / M | nothing / Accounts, later | ⚠️ |
| [F45](#f45--crowdsourced-route-edits-with-review) | Crowdsourced route edits with review | L | Accounts, later | ❌ |
| [F46](#f46--donations) | Donations | S | nothing | ✅ |
| **10. Accessibility and language** | | | | |
| [F47](#f47--filipino-and-other-languages) | Filipino (and other) languages | M | nothing | ✅ |
| [F48](#f48--how-to-ride-tips-for-first-timers) | How-to-ride tips for first-timers | S | nothing | ✅ |
| [F49](#f49--get-off-alerts) | Get-off alerts | L | Location decision, M8 | ❌ |
| **11. Sharing and alerts** | | | | |
| [F50](#f50--share-a-route-link) | Share a route link | S | M14 | ✅ |
| [F51](#f51--favourites-and-recent-routes-on-the-device) | Favourites and recent routes (on the device) | S | nothing | ✅ |
| **12. Admin and data upkeep** | | | | |
| [F52](#f52--one-web-page-per-route) | One web page per route (findable on Google) | M | Build-order step 5 | ✅ |
| [F53](#f53--publish-the-data-openly) | Publish the data openly | M | Build-order step 5 + licence decision | ⚠️ |
| [F54](#f54--ads-and-paid-business-services) | Ads and paid business services | L | — | ❌ |
| [F55](#f55--tickets-and-card-payments-in-the-app) | Tickets and card payments in the app | L | Payment partners + accounts | ❌ |

**55 features.** 34 ✅ · 9 ⚠️ · 12 ❌.

---

### 1. Finding a route

#### F01 · Browse a list of routes
- **In simple terms:** A panel listing every route by name. Tap one to see it on the map. Showing each route's length (in km) helps too.
- **Seen in:** [SakayCDO](#sakaycdo), [Sakay.ph](#sakayph) (Route Explorer), [JeepTa](#jeepta), [Davao Commuters](#davao-commuters), [Moovit](#moovit) (line pages)
- **Why commuters like it:** You can look up "the jeep I know" by name without planning a trip.
- **Pros for ParaPo:** Easy. It reads straight from `map.json`, works offline once the file is cached, and needs no location.
- **Cons / risks for ParaPo:** With 2 routes the list looks thin. Good, recognisable names matter (see F16).
- **Effort:** S · **Needs first:** Build-order step 5
- **Fits our decisions?** ✅

#### F02 · Show all routes, or focus on one
- **In simple terms:** Switch between "show every route" and "show only the one I picked". SakayCDO has "Show all routes on map" and "Clear selected route".
- **Seen in:** [SakayCDO](#sakaycdo)
- **Why commuters like it:** See the whole network first, then remove the clutter.
- **Pros for ParaPo:** Small UI work. It helps as routes start to overlap.
- **Cons / risks for ParaPo:** When many routes share a road, "show all" becomes a tangle. Drawing shared stretches neatly needs overlap detection.
- **Effort:** S · **Needs first:** Build-order step 5 (neat overlaps: M12)
- **Fits our decisions?** ✅

#### F03 · "Which routes pass here?" chooser
- **In simple terms:** Tap a spot or a street and get a short list ("3 routes here"). Pick one to highlight it.
- **Seen in:** [Sakay.ph](#sakayph) (tap a ride leg to see other routes for it); [SakayCDO](#sakaycdo) (routes filtered by your pins)
- **Why commuters like it:** Commuters often know a corner, not a route name.
- **Pros for ParaPo:** Already planned in M14. It runs on the phone, using the static file.
- **Cons / risks for ParaPo:** Thin lines are hard to tap, so it needs a forgiving tap area. Overlapping routes need matching (M12) to list correctly.
- **Effort:** M · **Needs first:** M14 (better with M12)
- **Fits our decisions?** ✅

#### F04 · One-ride finder from two pins
- **In simple terms:** Put a From pin and a To pin. The map lists routes that pass near both, in the right order, so one ride gets you there. It comes with "swap" and "clear" buttons.
- **Seen in:** [SakayCDO](#sakaycdo) ("Set both From and To pins to find the best 1-jeepney route", "Swap pins", "Clear pins")
- **Why commuters like it:** It answers the real question: "can one jeep take me there?"
- **Pros for ParaPo:** No typing, no place-search service and no location permission. It can be worked out on the phone.
- **Cons / risks for ParaPo:** It must check direction. The To pin has to come *after* the From pin along the route, or it will suggest riding the wrong way. Loops make "after" tricky.
- **Effort:** M · **Needs first:** M8 (distance along the route); M9 for loops
- **Fits our decisions?** ✅

#### F05 · Route detail page
- **In simple terms:** One page per route. It shows who operates it, where it starts and ends, hours, the fare rule, the list of stops, and a map.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer); [Moovit](#moovit) (line pages)
- **Why commuters like it:** Everything about "my jeep" is in one place.
- **Pros for ParaPo:** It can be built ahead of time as a static page, so it costs nothing to serve. It pairs with F52.
- **Cons / risks for ParaPo:** Every field is data the owner must collect and keep current. Empty fields look broken, so show "not yet checked" instead.
- **Effort:** M · **Needs first:** M8 (stops), M11 (fares, hours)
- **Fits our decisions?** ✅

#### F06 · Route variants (by day or service)
- **In simple terms:** The same route can run differently on weekdays, weekends, or as a shorter trip. Show each variant separately.
- **Seen in:** [Sakay.ph](#sakayph) (P2P schedules list Weekdays / Saturdays / Sundays separately)
- **Why commuters like it:** Nobody waits for a trip that doesn't run today.
- **Pros for ParaPo:** Matches the planned sub-routes (M10) and time-of-day notes (M11).
- **Cons / risks for ParaPo:** Jeepney variants are informal and change. Confirming them takes repeated rides.
- **Effort:** M · **Needs first:** M10, M11
- **Fits our decisions?** ✅

### 2. Planning a trip

#### F07 · A-to-B trip planner
- **In simple terms:** Enter a start and an end, and get steps: walk here, ride this, get off there.
- **Seen in:** [Sakay.ph](#sakayph), [Moovit](#moovit), [Google Maps](#google-maps), Komyut ([Also checked](#also-checked)), [Davao Commuters](#davao-commuters), [JeepTa](#jeepta)
- **Why commuters like it:** It's the main reason people open commute apps.
- **Pros for ParaPo:** The biggest payoff once coverage grows. It could run on the phone over the static file, with no server cost.
- **Cons / risks for ParaPo:** With 2 routes it gives empty or silly answers, which hurts trust. It needs stops in order, transfers and walking links, and a lot of testing.
- **Effort:** L · **Needs first:** M8, M10, M12, plus far more routes
- **Fits our decisions?** ⚠️ Partly. It is fine technically (on-device, $0). It is blocked by data coverage, not by decisions.

#### F08 · Transfer suggestions (2–3 rides)
- **In simple terms:** If no single jeep works, suggest two or three, and show where to change. SakayCDO colours each leg (1st, 2nd, 3rd jeep).
- **Seen in:** [SakayCDO](#sakaycdo) ("Best transfer route (2 jeepneys)", "(3 jeepneys)"); [Sakay.ph](#sakayph)
- **Why commuters like it:** Most real trips need a transfer.
- **Pros for ParaPo:** Ground-truthed hintuan are natural transfer points.
- **Cons / risks for ParaPo:** It needs to know where routes meet (corridor overlap) and how far you walk between them. The number of combinations grows fast.
- **Effort:** L · **Needs first:** M8, M12
- **Fits our decisions?** ⚠️ Partly. It needs many more routes to be useful.

#### F09 · Walking to and from the jeep
- **In simple terms:** Show the nearest place to board and to get off, and roughly how far you walk.
- **Seen in:** [SakayCDO](#sakaycdo) ("Nearest drop-off", "Estimated walk"); [Moovit](#moovit) ("how long you need to walk"); [JeepTa](#jeepta) ("where to board")
- **Why commuters like it:** It shows whether the trip is really convenient.
- **Pros for ParaPo:** A straight-line distance ("about 300 m away") is cheap and works offline.
- **Cons / risks for ParaPo:** Real walking paths need a router. The public OSRM demo server (which SakayCDO's code calls) is not safe for 100,000 visitors:
  - It says "Do not exceed 1 request per second".
  - It is for "reasonable, non-commercial use-cases".
  - It gives no guarantees.
  - A self-hosted router costs time and money.
- **Effort:** S (straight line) / L (real paths) · **Needs first:** M8
- **Fits our decisions?** ⚠️ Partly. Straight-line estimates fit. Public-router walking paths for visitors conflict with $0 and reliability.

#### F10 · Compare options by time and cost
- **In simple terms:** Show several trip options side by side, with minutes and pesos.
- **Seen in:** [Sakay.ph](#sakayph) ("Compare routes by travel time and cost"); Komyut ([Also checked](#also-checked)); [Moovit](#moovit)
- **Why commuters like it:** You can choose cheaper or faster.
- **Pros for ParaPo:** The cost side follows from F15.
- **Cons / risks for ParaPo:** Travel time needs speed data ParaPo doesn't have, and traffic changes everything. Guessed times clash with a "ground-truthed" promise.
- **Effort:** M (cost only) / L (time) · **Needs first:** F07, M11
- **Fits our decisions?** ⚠️ Partly. Cost fits. Time fits only if clearly marked as rough.

#### F11 · Results that respect the time of day
- **In simple terms:** A route that stops at 9 pm isn't suggested at 11 pm.
- **Seen in:** [Sakay.ph](#sakayph) (FAQ: "fewer routes available late at night and early morning")
- **Why commuters like it:** No waiting for jeeps that aren't running.
- **Pros for ParaPo:** A simple filter on M11's time-of-day notes.
- **Cons / risks for ParaPo:** Jeepney hours are informal. Confirming them needs rides at different hours.
- **Effort:** S (once the data exists) · **Needs first:** M11
- **Fits our decisions?** ✅

#### F12 · Tricycle last-mile zones
- **In simple terms:** Show the areas tricycles serve from a terminal, since many trips end with a trike ride.
- **Seen in:** [Sakay.ph](#sakayph) (tricycles "in beta"; FAQ: "fare rules vary per area, and they're registered in a local level")
- **Why commuters like it:** It completes the door-to-door picture.
- **Pros for ParaPo:** Ground-truthing suits trikes, which rarely appear in official data.
- **Cons / risks for ParaPo:** Rules and fares differ by city or barangay, and zones are fuzzy. It's a big field job, outside the current scope.
- **Effort:** L · **Needs first:** A new "zone" data type; M11-style notes
- **Fits our decisions?** ⚠️ Partly. It fits the decisions, but not the current scope.

### 3. Stops, terminals and fares

#### F13 · Stops in order along the route
- **In simple terms:** A numbered list of stops from start to end, marking where you can board and where you can get off.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer "Pick-up" / "Drop-off" columns); [Moovit](#moovit) (line pages); [TrainSight](#trainsight) ("upcoming stations")
- **Why commuters like it:** You can check "does it pass my stop, and before or after X?"
- **Pros for ParaPo:** This is the heart of M8, and it unlocks F04, F07 and F15.
- **Cons / risks for ParaPo:** Jeepneys stop almost anywhere, so you must decide which points count as stops.
- **Effort:** M · **Needs first:** M8
- **Fits our decisions?** ✅

#### F14 · Safe, legal boarding points
- **In simple terms:** Place suggested stops at sheds and busy walkways, space them regularly, and skip "no loading/unloading" spots.
- **Seen in:** [Sakay.ph](#sakayph) (FAQ: stops "about 100m apart", sheds preferred, stops with "no loading/unloading" signs removed)
- **Why commuters like it:** It feels safer, and nobody is told to board where it's illegal.
- **Pros for ParaPo:** ParaPo's hintuan are observed on the ground, a natural strength.
- **Cons / risks for ParaPo:** It needs site checks, and conditions change (new signs, new fences).
- **Effort:** M · **Needs first:** M8 (hotspots already exist)
- **Fits our decisions?** ✅

#### F15 · Fare estimate with the official fare rule
- **In simple terms:** Show what a ride should cost: the base fare plus a per-km amount, and the student/senior/PWD discount. Say where the rule came from.
- **Seen in:**
  - [Sakay.ph](#sakayph) (fares in results; Route Explorer fare rule)
  - [JeepTa](#jeepta) (₱13 base fare; 20% discount note)
  - Jeepney Routes Philippines ([Also checked](#also-checked); calculator by passenger type)
  - [TRENLigtas](#trenligtas) ("Fares are approximate")
  - PH Railway Transit ([Also checked](#also-checked))
  - [ikotMNL](#ikotmnl)
- **Why commuters like it:** It helps avoid overcharging and surprises.
- **Pros for ParaPo:** Distance along the route (M8) makes per-km maths easy. Fare stages fit M11.
- **Cons / risks for ParaPo:**
  - Fares change by LTFRB memorandum circular (usually PDFs), so show the circular and its date.
  - Drivers may charge differently. Sakay's FAQ admits fares "can sometimes be inconsistent".
  - Wrong fares hurt trust.
- **Effort:** M · **Needs first:** M8, M11 (fare stages)
- **Fits our decisions?** ✅

#### F16 · Signboard text and route code beside the official name
- **In simple terms:** Show the official LTFRB route name *and* what's actually written on the jeep (plus any route code).
- **Seen in:** [JeepTa](#jeepta) ("which jeepney code to ride"; tip: "Watch the signboard"). [Sakay.ph](#sakayph) shows official names only, and its FAQ explains why: signboards are informal, with "no central regulatory board".
- **Why commuters like it:** Riders read the signboard, not the franchise papers.
- **Pros for ParaPo:** This is exactly M11's "driver's word vs ridden" idea. It fills a gap Sakay chose not to fill.
- **Cons / risks for ParaPo:** Signboards can differ between jeeps on the same route. Confirming them takes rides or photos.
- **Effort:** S · **Needs first:** M11
- **Fits our decisions?** ✅

#### F17 · Operating hours and how often
- **In simple terms:** When the route runs (e.g. "24 hours") and roughly how long you wait between jeeps. That wait is called headway.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer "This route is operational 24 hours"; P2P schedules); [TRENLigtas](#trenligtas) (hours, headway); [Moovit](#moovit)
- **Why commuters like it:** You can plan early-morning and late-night trips.
- **Pros for ParaPo:** Simple text fields. An honest "observed on [date]" label fits ParaPo.
- **Cons / risks for ParaPo:** There are no official jeepney timetables, and old data guessed. Sakay's GTFS history has a commit called "Assume more frequent jeep arrival times".
- **Effort:** S · **Needs first:** M11
- **Fits our decisions?** ✅

#### F18 · How you can pay on this route
- **In simple terms:** A tag such as "cash only", "beep card" or "QR (GCash/Maya)".
- **Seen in:** [beep™ app](#beep-app) (card used on LRT/MRT and some buses); [i-Jeepney](#i-jeepney) (QR, claimed); Love Bus ([Also checked](#also-checked); "QR boarding")
- **Why commuters like it:** Modern jeeps and buses may not take cash, and older jeeps take only cash.
- **Pros for ParaPo:** It's only a label, with no payment handling.
- **Cons / risks for ParaPo:** It changes when operators switch systems, so it needs re-checking.
- **Effort:** S · **Needs first:** M11
- **Fits our decisions?** ✅

### 4. Live information

#### F19 · Live vehicle positions
- **In simple terms:** Moving dots showing where each jeep, bus or train is right now.
- **Seen in:**
  - [TrainSight](#trainsight)
  - [Sakay.ph](#sakayph) (EDSA Carousel buses, per FAQ)
  - [Davao Commuters](#davao-commuters) (DIBS buses)
  - [Mandaue Commuter Transport Map](#mandaue-commuter-transport-map) (secondary)
  - [i-Jeepney](#i-jeepney) (claimed)
  - [Moovit](#moovit) (where operators share GPS)
  - [TRENLigtas](#trenligtas) (predicted)
- **Why commuters like it:** Less waiting and guessing.
- **Pros for ParaPo:** Very attractive to visitors.
- **Cons / risks for ParaPo:**
  - It needs GPS devices on vehicles, a driver app, or operator data feeds.
  - It needs a live server, not a static file, which breaks the $0 plan.
  - It raises privacy concerns for drivers.
  - ParaPo has no operator partners.
- **Effort:** L · **Needs first:** Operator partnership + a live backend (not planned)
- **Fits our decisions?** ❌ Needs live GPS tracking and a server.

#### F20 · Arrival estimates (ETA)
- **In simple terms:** "Next jeep in about 6 minutes" at a stop.
- **Seen in:** [TrainSight](#trainsight), [TRENLigtas](#trenligtas), [ikotMNL](#ikotmnl), [i-Jeepney](#i-jeepney) (claimed), [Mandaue Commuter Transport Map](#mandaue-commuter-transport-map) (secondary), [Google Maps](#google-maps) (where available), [Moovit](#moovit)
- **Why commuters like it:** Helps you decide whether to wait or walk.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** It needs live data (F19) or reliable timetables, and jeepneys have neither. Wrong ETAs are worse than none.
- **Effort:** L · **Needs first:** F19
- **Fits our decisions?** ❌ Needs live data.

#### F21 · Crowd levels
- **In simple terms:** How full a station or vehicle is.
- **Seen in:** [ikotMNL](#ikotmnl) (crowd monitoring per station); [TrainSight](#trainsight) (crowd density); [Google Maps](#google-maps) (crowdedness where available)
- **Why commuters like it:** You can avoid the crush or wait for the next one.
- **Pros for ParaPo:** A static note such as "usually packed 7–9 am" (an M11 annotation) is a cheap cousin that does fit.
- **Cons / risks for ParaPo:** Live crowding needs sensors, operator data or user reports, and it changes minute to minute.
- **Effort:** L · **Needs first:** A live data source
- **Fits our decisions?** ❌ Needs live data or visitor reports (the static "usually packed" note fits).

#### F22 · Service notices
- **In simple terms:** A short dated message, such as "Rerouted at X due to roadworks, since 3 Sept".
- **Seen in:** [TrainSight](#trainsight) (alerts, disruption updates); [ikotMNL](#ikotmnl) (advisories, news); [Moovit](#moovit) (alerts); [Google Maps](#google-maps) (delay notices)
- **Why commuters like it:** No surprises.
- **Pros for ParaPo:** The owner writes a notice into `map.json` at publish time. It costs nothing and works offline.
- **Cons / risks for ParaPo:** Old notices mislead, so always date them and remove them when they're over. Push notifications would need a server and subscriptions.
- **Effort:** S (static notice) · **Needs first:** Build-order step 5
- **Fits our decisions?** ⚠️ Partly. Static, dated notices fit. Push alerts don't.

#### F23 · Community-powered tracking and reports
- **In simple terms:** Riders' phones share their movement or reports (with permission). The app turns this into live positions or arrival times.
- **Seen in:** [TrainSight](#trainsight) (optional "community tracking", which may keep sending data "while the app is not on screen"); [TRENLigtas](#trenligtas) ("live ETAs from community reports"); [Moovit](#moovit) (community reports)
- **Why commuters like it:** Live information without special hardware.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** It needs location permission, background tracking, a server, accounts or abuse controls, and a privacy policy.
- **Effort:** L · **Needs first:** Accounts + live backend
- **Fits our decisions?** ❌ Needs tracking, contributions and a server.

#### F24 · Hail the jeep from your phone
- **In simple terms:** Tap a button to signal an approaching driver to stop for you.
- **Seen in:** [i-Jeepney](#i-jeepney) ("Hail Your Ride with Para", claimed)
- **Why commuters like it:** No waving in the rain or at night.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** It needs a driver app, live positions and visitor accounts. It also raises safety and liability questions.
- **Effort:** L · **Needs first:** F19 + accounts + driver partners
- **Fits our decisions?** ❌ Needs accounts, tracking and a live server.

### 5. Offline and data saving

#### F25 · Offline map you can install
- **In simple terms:** Add ParaPo to your home screen. It still opens with the last published routes when there's no signal.
- **Seen in:** [Google Maps](#google-maps) (offline maps, but no transit directions offline, and areas expire); [Sakay.ph](#sakayph) (no full offline mode; keeps "the most recent search you made")
- **Why commuters like it:** Signal drops in crowds, underground, and when load runs out.
- **Pros for ParaPo:**
  - Already decided (M15).
  - `map.json` is small today and easy to cache.
  - It beats Google Maps' offline transit gap.
  - Remembering the last route opened, on the device only, is a small extra like Sakay's.
- **Cons / risks for ParaPo:** Map tiles are the hard part.
  - The OSM tile servers forbid offline use.
  - OpenFreeMap says "There are no limits on the number of map views or requests" and offers full downloads for self-hosting.
  - We did not confirm that bulk pre-caching from its *public* server is welcome.
  - The safer options: cache only tiles the visitor actually viewed, or self-host a Metro Manila extract.
  - Always show "last updated" so stale data is obvious.
- **Effort:** M · **Needs first:** Build-order step 5, M15
- **Fits our decisions?** ✅

#### F26 · Load route lines only when needed
- **In simple terms:** First load a light list of routes. Download a route's full line only when someone opens it.
- **Seen in:** [SakayCDO](#sakaycdo) ("Will load when this route is selected.")
- **Why commuters like it:** A faster start and less mobile data.
- **Pros for ParaPo:** The first load stays fast as routes grow. Cloudflare serves many small static files well.
- **Cons / risks for ParaPo:** It pulls against offline use, which needs every route cached anyway. It isn't needed until the file is big.
- **Effort:** S–M · **Needs first:** Build-order step 5 (split the file later)
- **Fits our decisions?** ✅ (plan it together with M15)

#### F27 · Low graphics mode
- **In simple terms:** A setting that hides extra map details and effects, so old or cheap phones stay smooth and use less battery.
- **Seen in:** [TrainSight](#trainsight) ("low graphics mode")
- **Why commuters like it:** Many commuters use budget phones.
- **Pros for ParaPo:** MapLibre can hide style layers (e.g. extra labels or building shapes) with a toggle.
- **Cons / risks for ParaPo:** Two map looks to test.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅

### 6. Map look and readability

#### F28 · Clear legend
- **In simple terms:** A small key that explains line colours and pin shapes.
- **Seen in:** [SakayCDO](#sakaycdo) (Routes: Inbound, Outbound, 1st/2nd/3rd Jeep; Pins: From, To, Your location, Drop-off)
- **Why commuters like it:** New users understand the map without guessing.
- **Pros for ParaPo:** Tiny effort. It also explains terminals vs hintuan.
- **Cons / risks for ParaPo:** Keep it short, and collapsible on phones.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅

#### F29 · Direction shown on the line
- **In simple terms:** Show which way a route goes, with different styles for inbound and outbound, or arrows along the line.
- **Seen in:** [SakayCDO](#sakaycdo) (inbound/outbound colours; "preview its path and direction"); [TrainSight](#trainsight) ("Follow train movement in either travel direction")
- **Why commuters like it:** It prevents boarding the jeep going the wrong way, a classic newcomer mistake.
- **Pros for ParaPo:** ParaPo already stores 2 directions. MapLibre can draw arrow symbols along a line.
- **Cons / risks for ParaPo:** When both directions share a street, the lines need a small offset to stay readable.
- **Effort:** S · **Needs first:** nothing (data exists)
- **Fits our decisions?** ✅

#### F30 · Name labels on or off
- **In simple terms:** A toggle that shows or hides stop and terminal names on the map.
- **Seen in:** [TrainSight](#trainsight) (station name labels setting)
- **Why commuters like it:** Labels help reading, and hiding them clears clutter.
- **Pros for ParaPo:** A simple layer toggle.
- **Cons / risks for ParaPo:** Few; it's one more setting to design.
- **Effort:** S · **Needs first:** nothing for hotspots; M8 for stops
- **Fits our decisions?** ✅

#### F31 · Landmarks along the route
- **In simple terms:** Show well-known places near the route (malls, schools, churches) so riders can tell where they are.
- **Seen in:** [Davao Commuters](#davao-commuters) ("Route visualization with landmarks"); [JeepTa](#jeepta) (corridor descriptions name malls and schools); [Sakay.ph](#sakayph) (Place Finder); [ikotMNL](#ikotmnl) and PH Railway Transit (nearby attractions)
- **Why commuters like it:** Filipinos give directions by landmarks.
- **Pros for ParaPo:** Fits the hotspot model as one more point type, and it feeds place search (F34).
- **Cons / risks for ParaPo:** The base map already shows some places. A curated list needs upkeep, and "tourist spots" drift off mission.
- **Effort:** M · **Needs first:** Build-order step 5 (new point type)
- **Fits our decisions?** ✅

#### F32 · Rail and busway stations as context
- **In simple terms:** Show LRT/MRT stations and EDSA Carousel stops, so riders see where jeeps meet trains and buses.
- **Seen in:** [Sakay.ph](#sakayph), [Moovit](#moovit), [Google Maps](#google-maps) (multi-mode); [TrainSight](#trainsight), [TRENLigtas](#trenligtas) (trains)
- **Why commuters like it:** Many trips mix a jeep and a train.
- **Pros for ParaPo:** The base map may already show rail lines. OpenStreetMap data can supply stations.
- **Cons / risks for ParaPo:** Using OpenStreetMap data requires ODbL attribution. It must not look like ParaPo covers trains in detail.
- **Effort:** S–M · **Needs first:** nothing (first check what the Liberty style already shows); M12 for OSM relations
- **Fits our decisions?** ✅

### 7. Search and places

#### F33 · Type-a-place search (geocoding)
- **In simple terms:** Type "SM North" and the map jumps there. Geocoding turns a name or address into a map point. Reverse geocoding turns a map point back into a name.
- **Seen in:** [SakayCDO](#sakaycdo) (Nominatim search and reverse; Photon in the code); [Sakay.ph](#sakayph) (Photon on its own domain; ArcGIS geocoder referenced); [Moovit](#moovit); [Google Maps](#google-maps)
- **Why commuters like it:** It's the easiest way to say where you're going.
- **Pros for ParaPo:** Familiar, and a big usability boost.
- **Cons / risks for ParaPo:**
  - Public Nominatim allows at most 1 request per second and no autocomplete built on it from the browser. Results must be cached, attribution is required, and access can be withdrawn.
  - Public Photon: "extensive usage will be throttled", with no availability guarantee.
  - At 100,000 visitors this means self-hosting (server cost and upkeep) or a paid service.
  - Visitors' search words go to a third party, which is a privacy concern.
  - It doesn't work offline.
- **Effort:** M · **Needs first:** A self-hosted or paid geocoder
- **Fits our decisions?** ❌ for now. Public services conflict with scale and $0. Use F34 instead.

#### F34 · Search ParaPo's own places
- **In simple terms:** Search only a list that ships inside `map.json`: terminals, hintuan, landmarks and barangay names.
- **Seen in:** [Sakay.ph](#sakayph) (Place Finder: a curated list of malls, terminals and schools by city); [JeepTa](#jeepta) (start from "a barangay, landmark, or street")
- **Why commuters like it:** Commuters search by terminal and landmark names anyway.
- **Pros for ParaPo:** Works offline and is instant. No third party, no rate limits, no privacy leak.
- **Cons / risks for ParaPo:** It only finds what the owner added. It needs spelling variants (e.g. "Cubao" and "Araneta City").
- **Effort:** S–M · **Needs first:** Build-order step 5
- **Fits our decisions?** ✅

#### F35 · Drop a pin instead of typing
- **In simple terms:** Tap or long-press to put a From/To pin on the map.
- **Seen in:** [SakayCDO](#sakaycdo) ("Pin From" / "Pin To"); [Davao Commuters](#davao-commuters) (pin-based; reviewers ask for typing too)
- **Why commuters like it:** It works when you don't know the place name.
- **Pros for ParaPo:** Needs no geocoding service. It pairs with F03 and F04.
- **Cons / risks for ParaPo:** Harder for people who don't read maps well, so offer F34 as well.
- **Effort:** S · **Needs first:** nothing (most useful with M14 / M8)
- **Fits our decisions?** ✅

#### F36 · "Locate me" dot
- **In simple terms:** A button that shows your position as a dot.
- **Seen in:** [SakayCDO](#sakaycdo) ("Locate me"); PH Railway Transit ([Also checked](#also-checked); "live route tracking using current location"); [TrainSight](#trainsight) (optional location sharing)
- **Why commuters like it:** It answers "where am I compared to the route?"
- **Pros for ParaPo:** It can stay entirely on the phone, with nothing sent anywhere. It would only ask when the button is tapped.
- **Cons / risks for ParaPo:** It needs the location permission, which the plan keeps out of v1 and leaves for its own decision later (PLAN.md, M14). The browser's permission prompt can put people off, so explain plainly that nothing is sent.
- **Effort:** S · **Needs first:** Owner decision on the location permission
- **Fits our decisions?** ⚠️ Partly. It's privacy-safe, but depends on the open permission decision.

#### F37 · Suggest a missing place
- **In simple terms:** A form to tell the app about a place it can't find.
- **Seen in:** [Sakay.ph](#sakayph) (its FAQ links a "submit-place" page, which returned 404 on 2026-09-14)
- **Why commuters like it:** Gaps get filled.
- **Pros for ParaPo:** Fits the future review inbox.
- **Cons / risks for ParaPo:** Visitor submissions conflict with "no contributions" today. It brings spam and moderation work.
- **Effort:** M · **Needs first:** Accounts, later (review inbox)
- **Fits our decisions?** ❌ for now. It needs contributions.

### 8. Trust and accuracy

#### F38 · Accuracy notice and "not official" statement
- **In simple terms:** A short, visible note:
  - Routes are checked by hand and may change.
  - Follow what you see on the ground.
  - This is not an LTFRB or DOTr app.
- **Seen in:** [TrainSight](#trainsight) ("estimates"; "not an official application of any railway operator or government agency"); Jeepney Routes Philippines ([Also checked](#also-checked); "Please verify route information before traveling"); [TRENLigtas](#trenligtas) ("Fares are approximate")
- **Why commuters like it:** It sets fair expectations.
- **Pros for ParaPo:** Tiny effort, and it protects the project. It matches the DOTC licence's no-endorsement rule if that data is ever used for matching.
- **Cons / risks for ParaPo:** Too much warning text makes the map feel unreliable, so keep it short.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅

#### F39 · "Last ridden" date per route
- **In simple terms:** Each route shows when it was last checked on the ground, and how ("ridden end to end" or "driver said").
- **Seen in:** None of the apps checked shows this to users. [SakayCDO](#sakaycdo)'s code has an `updated_at` field. [Moovit](#moovit) line pages are titled "(Updated)" without a visible date.
- **Why commuters like it:** Riders can see how fresh the information is.
- **Pros for ParaPo:** Possibly ParaPo's biggest difference: ground truth made visible. It's cheap once M11 exists.
- **Cons / risks for ParaPo:** Honest dates can look old. It takes discipline to keep updated.
- **Effort:** S · **Needs first:** M11
- **Fits our decisions?** ✅

#### F40 · Credits and "how this map is made" page
- **In simple terms:** A plain page: who made it, where the data comes from, which map data and tools are used (with required credits), and known limits.
- **Seen in:** [Sakay.ph](#sakayph) (About page; a detailed FAQ on stop placement, route cutting and fares); [TrainSight](#trainsight) (maker named, independent); Jeepney Routes Philippines ([Also checked](#also-checked); "Made by …", "community-driven"). [SakayCDO](#sakaycdo) shows no credits at all.
- **Why commuters like it:** People trust what they understand.
- **Pros for ParaPo:** Required attributions live here too. OpenFreeMap says "Attribution is required" ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap").
- **Cons / risks for ParaPo:** Needs an occasional update.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅

#### F41 · Be honest about coverage
- **In simple terms:** Say how many routes are mapped and show where there's no data yet, instead of looking complete.
- **Seen in:** [SakayCDO](#sakaycdo) ("76 route options available"); [Sakay.ph](#sakayph) (FAQ: "coverage is limited to Metro Manila and surrounding areas for now"); [JeepTa](#jeepta) ("More Routes Coming")
- **Why commuters like it:** Nobody assumes "no route shown" means "no jeep exists".
- **Pros for ParaPo:** Important with 2 routes. It could show a "mapped so far" outline.
- **Cons / risks for ParaPo:** A small number can look unimpressive early on.
- **Effort:** S · **Needs first:** Build-order step 5
- **Fits our decisions?** ✅

#### F42 · Link each route to its official record
- **In simple terms:** Show the official route code or franchise reference (LTFRB), and how ParaPo's drawn line compares with it.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer "Operated by LTFRB (PUB)"; route IDs starting "DOTR:"); [Moovit](#moovit) (jeepney lines filed under "LTFRB")
- **Why commuters like it:** It helps when the official route and the real one differ.
- **Pros for ParaPo:** Planned in M12 (matching against reference data). It highlights "official vs ridden" differences.
- **Cons / risks for ParaPo:** Every reference source has limits:
  - The 2014–2015 DOTC GTFS is under a DOTC licence, not an open one ("DOTC owns all rights").
  - LTFRB circulars are PDFs that must be read by hand.
  - Routes rationalised under the LPTRP may differ from what actually runs.
- **Effort:** M · **Needs first:** M12
- **Fits our decisions?** ✅ (watch the licences)

#### F43 · AI chat or AI route suggestions
- **In simple terms:** Ask a chatbot "how do I get to X?" and get an answer written by an AI model.
- **Seen in:** Komyut ([Also checked](#also-checked); "AI-Powered Recommendations"); [TRENLigtas](#trenligtas) (LigtasAI, labelled as not a replacement for official advisories)
- **Why commuters like it:** Natural questions, no map-reading needed.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** It costs money per question at scale and needs a server. AI can invent routes that don't exist, the opposite of ground truth.
- **Effort:** M · **Needs first:** A paid AI service and a server
- **Fits our decisions?** ❌ Costs at scale, and it risks made-up routes.

### 9. Community and contributions

#### F44 · Report a problem
- **In simple terms:** A "report issue" link next to a route, fare or stop.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer "Report Issue" on each section; feedback@sakay.ph); [ikotMNL](#ikotmnl) (feedback form); [Moovit](#moovit) (community reports)
- **Why commuters like it:** Riders spot changes first.
- **Pros for ParaPo:** A plain email link needs no accounts and stores nothing inside ParaPo. It gives early warning of changed routes.
- **Cons / risks for ParaPo:** Someone has to read the inbox, and emails carry people's addresses (privacy). An in-app form would count as a "contribution", which v1 excludes.
- **Effort:** S (email link) / M (in-app form) · **Needs first:** nothing (email) / Accounts, later (form)
- **Fits our decisions?** ⚠️ Partly. An email link sits outside the app and is the owner's call. An in-app form conflicts for now.

#### F45 · Crowdsourced route edits with review
- **In simple terms:** Users propose new or changed routes, and someone checks them before they go public.
- **Seen in:** [Sakay.ph](#sakayph) ("crowd-sourced route database"); Jeepney Routes Philippines ([Also checked](#also-checked); "Help expand our database by adding new jeepney routes"); [Moovit](#moovit) (community editor)
- **Why commuters like it:** Coverage grows faster than one person can ride.
- **Pros for ParaPo:** Matches the "Accounts, later" plan: suggestions go to an inbox, and the owner approves.
- **Cons / risks for ParaPo:**
  - It needs member accounts, moderation, and spam and abuse controls.
  - Suggestions would be written into the database (watch Supabase Free-plan limits).
  - Ground truth gets weaker unless each suggestion is ridden.
- **Effort:** L · **Needs first:** Accounts, later
- **Fits our decisions?** ❌ for now. It needs member accounts and contributions.

#### F46 · Donations
- **In simple terms:** A "support this project" link, e.g. GCash or Ko-fi.
- **Seen in:** [Sakay.ph](#sakayph) ("Kaakbay" via GCash); [TrainSight](#trainsight) (Ko-fi and GCash)
- **Why commuters like it:** Grateful riders get a way to help.
- **Pros for ParaPo:** Just a link, with no accounts.
- **Cons / risks for ParaPo:** ParaPo costs $0 now. Taking money can create expectations, and it may raise tax or registration questions (not researched here).
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅ (owner's call; not needed yet)

### 10. Accessibility and language

#### F47 · Filipino (and other) languages
- **In simple terms:** Visitors can switch the app's words between English and Filipino, and maybe more.
- **Seen in:** [TrainSight](#trainsight) (English, Filipino, Japanese, Korean, Chinese, Spanish); [Sakay.ph](#sakayph) (some pages in Filipino)
- **Why commuters like it:** Many riders are more comfortable in Filipino, and visitors need English.
- **Pros for ParaPo:** Static text only, with no running cost.
- **Cons / risks for ParaPo:** Every new text needs two versions. Route and place names stay as they are.
- **Effort:** M · **Needs first:** nothing
- **Fits our decisions?** ✅

#### F48 · How-to-ride tips for first-timers
- **In simple terms:** A short guide: shout "Para!", pass your fare forward, check the signboard, know the peak hours, and ask for discounts.
- **Seen in:** [JeepTa](#jeepta) ("Riding Tips"); [Sakay.ph](#sakayph) (FAQ on route cutting, stop placement and fares)
- **Why commuters like it:** Newcomers, students and tourists feel confident.
- **Pros for ParaPo:** Static and cheap, and it fits the name "ParaPo" perfectly.
- **Cons / risks for ParaPo:** Habits differ by city, so keep the tips Metro Manila-specific and checked.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅

#### F49 · Get-off alerts
- **In simple terms:** The phone beeps, speaks or vibrates when you're near your stop.
- **Seen in:** [TrainSight](#trainsight) (sound, voice and vibration alerts); [Moovit](#moovit) ("get-off alerts"); [Davao Commuters](#davao-commuters) (stop notifications)
- **Why commuters like it:** You don't miss your stop, even when you can't see outside or don't know the area. It also helps blind and low-vision riders.
- **Pros for ParaPo:** It could work entirely on the phone.
- **Cons / risks for ParaPo:**
  - It needs continuous location while riding, and the plan keeps the location permission out of v1.
  - Web pages generally can't keep reading location once the screen is off or the page is in the background.
  - It drains the battery.
  - Realistically it needs the future APK.
- **Effort:** L · **Needs first:** Location decision, M8, probably an APK
- **Fits our decisions?** ❌ for now. It needs continuous location.

### 11. Sharing and alerts

#### F50 · Share a route link
- **In simple terms:** Copy a link that opens ParaPo straight to one route (or stop).
- **Seen in:** [Sakay.ph](#sakayph) (About: presents commuting data in a way that is "simple, searchable and shareable"; each Route Explorer route has its own web address); [Moovit](#moovit) (each line page has its own address)
- **Why commuters like it:** You can send a friend "ride this one".
- **Pros for ParaPo:** Planned in M14. It works with static hosting, because the route ID lives in the link. Phones can use their built-in share menu.
- **Cons / risks for ParaPo:** Route IDs must never change, or old links break.
- **Effort:** S · **Needs first:** M14; stable route IDs (Build-order step 5)
- **Fits our decisions?** ✅

#### F51 · Favourites and recent routes (on the device)
- **In simple terms:** Star routes or stops. The app remembers them on your phone only.
- **Seen in:** [TrainSight](#trainsight) (favourite stations); [Moovit](#moovit) (favourites); [Sakay.ph](#sakayph) (trip history, but tied to Google sign-in)
- **Why commuters like it:** One tap to your daily route.
- **Pros for ParaPo:** Uses browser storage. No account needed, and it works offline.
- **Cons / risks for ParaPo:** Favourites are lost if browser data is cleared or the phone changes. Syncing across devices would need accounts.
- **Effort:** S · **Needs first:** nothing
- **Fits our decisions?** ✅ on the device only. Syncing with sign-in (like Sakay) would be ❌.

### 12. Admin and data upkeep

#### F52 · One web page per route
- **In simple terms:** Build a simple static page for each route. Then a web search like "Cubao to Quiapo jeep" can find ParaPo.
- **Seen in:** [Sakay.ph](#sakayph) (Route Explorer pages; Place Finder pages per city); [Moovit](#moovit) (line pages)
- **Why commuters like it:** They find the answer from an ordinary web search.
- **Pros for ParaPo:** Static files on Cloudflare cost $0. The pages are made from `map.json` at publish time, and they bring in visitors.
- **Cons / risks for ParaPo:** More work in the publish step. Pages with little data may rank poorly.
- **Effort:** M · **Needs first:** Build-order step 5 (better with M8 / M11)
- **Fits our decisions?** ✅

#### F53 · Publish the data openly
- **In simple terms:** Offer the route data as a download with a clear licence, so others can reuse it. It could also come in GTFS, the standard file format for transit data.
- **Seen in:** [Sakay.ph](#sakayph) (github.com/sakayph/gtfs, 2014–2015); [TrainSight](#trainsight) ("Open API"); [Google Maps](#google-maps) (agencies share GTFS with Google)
- **Why commuters like it:** Other apps and researchers can build on it, which helps commuters everywhere.
- **Pros for ParaPo:** `map.json` is public in practice already. A licence makes reuse clear, and a GTFS export could put ParaPo routes into other apps.
- **Cons / risks for ParaPo:**
  - Choosing a licence is a real decision.
  - Lines snapped to OpenStreetMap roads *may* count as derived from OSM (ODbL share-alike). Check before choosing.
  - Nothing derived from the DOTC GTFS can be relicensed.
  - Jeepneys fit GTFS schedules poorly. The DOTC feed used assumed frequencies.
- **Effort:** M · **Needs first:** Build-order step 5; licence decision; M8 for GTFS stops
- **Fits our decisions?** ⚠️ Partly. It fits $0 and static hosting, but the licence needs care.

#### F54 · Ads and paid business services
- **In simple terms:** Earn money from in-app ads, or by selling data analysis and systems to cities and operators.
- **Seen in:** [Sakay.ph](#sakayph):
  - "Advertise with Us".
  - /partner: transport management, payments, booking, "Urban Mobility Intelligence", advertising.
  - Its App Store privacy details say some data is used for advertising.
- **Why commuters like it:** Commuters don't benefit directly; it pays the makers' bills.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** Ads usually come with tracking scripts, which conflicts with "no tracking". Business services are a company's work, not a one-person map.
- **Effort:** L · **Needs first:** —
- **Fits our decisions?** ❌ Conflicts with no tracking.

#### F55 · Tickets and card payments in the app
- **In simple terms:** Buy train tickets, load a transit card or pay a fare from your phone.
- **Seen in:** [ikotMNL](#ikotmnl) (buy LRT-1 tickets); [beep™ app](#beep-app) (QR tickets, NFC loading); [Moovit](#moovit) (tickets "in supported metro areas"); [i-Jeepney](#i-jeepney) (QR payment, claimed)
- **Why commuters like it:** No queue at the ticket booth.
- **Pros for ParaPo:** None for now.
- **Cons / risks for ParaPo:** Handling money needs partners, security, legal work and user accounts.
- **Effort:** L · **Needs first:** Operator/payment partners + accounts
- **Fits our decisions?** ❌ Needs accounts, money handling and a server.

---

## Part 4 — Shortlist

### Good fits soon
These need nothing, or only Build-order step 5, or a small piece of M14.

- **F29 Direction on the line** — the data already has two directions; stops wrong-way rides.
- **F28 Clear legend** — tiny; explains terminals vs hintuan.
- **F01 Route list + F02 show all / focus one** — reads straight from `map.json`.
- **F38 Accuracy notice + F40 Credits page + F41 Honest coverage** — cheap trust builders; F40 also covers the required OpenFreeMap/OSM attribution.
- **F50 Share a route link** — no server; already part of M14.
- **F48 How-to-ride tips** — static, cheap, and on-brand.
- **F34 Search ParaPo's own places + F35 Drop a pin** — no third-party geocoder; works offline; private.
- **F22 Dated service notices in `map.json`** — no push, no server.
- **F51 Favourites on the device** — no accounts.
- **F27 Low graphics mode** — helps budget phones.
- **F52 One page per route** — static and $0; helps people find ParaPo from web search.
- **F47 Filipino language** — static text only.
- **F44 Report-a-problem email link** — owner's call; it sits outside the app, not an in-app contribution.
- **F32 Rail and busway stations as context** — first check what the Liberty base style already shows.

### Later
These need bigger groundwork.

- **F13 Stops in order, F14 Safe boarding points** — need M8.
- **F04 One-ride finder from pins** — needs M8 (and M9 for loops).
- **F03 "Routes here" chooser** — needs M14, better with M12.
- **F15 Fares, F16 Signboard names, F17 Hours, F18 Payment tags, F11 Time-of-day** — need M11.
- **F39 Last-ridden date** — needs M11; likely ParaPo's standout feature.
- **F05 Route detail page, F06 Variants** — need M8, M10, M11.
- **F42 Official record link** — needs M12 and licence checks.
- **F25 Offline install** — already planned as M15; the tile-caching approach must be settled first.
- **F26 Lazy loading** — only when the file grows; plan it with M15.
- **F31 Landmarks** — a new point type, plus upkeep.
- **F07 Trip planner, F08 Transfers, F09 Walking (straight-line), F10 Cost comparison** — need M8 + M10 + M12 and far more routes.
- **F53 Open data** — needs a licence decision (OSM ODbL, DOTC terms).
- **F36 Locate me** — waits on the location-permission decision.
- **F46 Donations** — only if real costs appear.
- **F12 Tricycle zones** — a new data type and lots of field work.
- **F45 Crowdsourced edits with review, F37 Suggest a place** — need Accounts, later.

### Not for ParaPo (for now)

- **F19 Live positions, F20 ETAs, F21 Live crowd levels** — need live GPS or operator data and a server.
- **F23 Community tracking** — needs background location, accounts and a server.
- **F24 Hail the jeep** — needs a driver app, accounts and a live system.
- **F33 Place search on public Nominatim / Photon** — rate limits, no autocomplete, can be blocked; sends visitors' searches to third parties.
- **F43 AI chat** — costs per question, and it can invent routes.
- **F49 Get-off alerts** — need continuous location, which web apps handle poorly.
- **F54 Ads and business services** — ads mean tracking.
- **F55 Tickets and payments** — money, partners and accounts.
- **Synced trip history with sign-in (the Sakay version of F51)** — needs visitor accounts.
- **Raster tiles from tile.openstreetmap.org (SakayCDO's choice)** — "Offline use is not permitted", and access can be blocked without notice.
- **Walking paths from the public OSRM demo server for visitors (part of F09)** — 1 request per second, non-commercial use only, no guarantees.

---

## Part 5 — Glossary in simple words

| Term | Meaning |
|---|---|
| **API** | A doorway that lets one program ask another program for data (e.g. "give me train positions"). |
| **APK / sideloading** | An APK is an Android app file. Sideloading means installing it directly, not from Google Play. |
| **Attribution** | The credit line a data or map provider requires, e.g. "© OpenStreetMap contributors". |
| **Autocomplete** | Suggestions that appear while you type. Every keystroke can send a request, which is why public Nominatim forbids it. |
| **Corridor overlap** | Where two or more routes use the same stretch of road. |
| **Crowdsourcing** | Collecting information from many ordinary users instead of one team. |
| **ETA** | Estimated time of arrival: "next jeep in about 6 minutes". |
| **Fare matrix** | A table or rule for fares, e.g. base fare for the first km plus an amount per extra km. |
| **Franchise (LTFRB)** | The government permit that lets an operator run a public vehicle on a specific route. |
| **Geocoding / place search** | Turning a typed name or address into a point on the map. |
| **Reverse geocoding** | Turning a point on the map back into a name or address. |
| **GPS tracking** | Using a device's satellite position to follow a vehicle or person over time. |
| **GTFS** | General Transit Feed Specification: a standard set of text files (routes, stops, trips, times) that apps like Google Maps read. |
| **GTFS Realtime** | The live add-on to GTFS: vehicle positions, delays and alerts. |
| **Headless browser** | A web browser controlled by a script, with no window. Used to load and inspect sites automatically. |
| **Headway** | The usual time between one vehicle and the next on a route. |
| **Hintuan / terminal** | In ParaPo: a hintuan is where people wait and board; a terminal is where a route starts. |
| **Lazy loading** | Downloading something only when it's needed, not at the start. |
| **Linear referencing** | Describing a place by its distance along a route ("stop at 2,350 m"). This is how you know stop order. |
| **NFC** | Near-field communication: short-range "tap" technology in phones and cards. |
| **ODbL** | Open Database License, OpenStreetMap's data licence. You may use the data but must give credit, and shared changed data must stay open. |
| **Offline map** | A map that still works with no internet, because its data was saved on the device earlier. |
| **OSRM / router** | A routing engine: a program that finds a path along roads (for driving or walking). |
| **PWA** | Progressive Web App: a website you can install on your home screen that can work offline. |
| **Rate limit** | A cap on how many requests you may send (e.g. 1 per second). Break it and you can be blocked. |
| **Raster vs vector tiles** | Map tiles are the small squares a map is built from. Raster tiles are ready-made pictures. Vector tiles are raw shapes that your phone draws, so they can be restyled and are usually smaller. |
| **Route cutting** | A jeep turning back before the end of its official route. |
| **SEO** | Search engine optimisation: making pages easy for Google and others to find and show. |
| **Static file** | A file served as-is, with no program running on a server. Cheap and fast to host. |
| **Tile server** | A server that hands out map tiles. |
| **Transfer** | Getting off one vehicle and onto another to finish a trip. |
| **Trip planner** | A tool that works out how to get from A to B using public transport. |

---

## Part 6 — Sources

All links were checked on 2026-09-14 unless noted. Links are primary unless marked *secondary*.

### SakayCDO sources
- https://sakaycdo.vercel.app/ — first-hand inspection of the live site, 2026-09-14 (page text, legend, labels in the page code)
- https://operations.osmfoundation.org/policies/tiles/ — OpenStreetMap tile usage policy
- https://operations.osmfoundation.org/policies/nominatim/ — Nominatim usage policy
- https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server — OSRM demo server policy
- https://photon.komoot.io/ — Photon public API notes

### Sakay.ph sources
- https://www.sakay.ph/ — homepage (text and page code)
- https://www.sakay.ph/about
- https://www.sakay.ph/partner
- https://www.sakay.ph/kaakbay/
- https://blog.sakay.ph/sakay-ph-faqs/ — FAQ (posted 28 Feb 2019, edited since)
- https://explore.sakay.ph/routes/DOTR:R_SAKAY_PUB_808 — Route Explorer, EDSA Carousel
- https://p2p.sakay.ph/
- https://placefinder.sakay.ph/
- https://tracker.sakay.ph/ — title only (content loads by script)
- https://sakay.ph/submit-place/ — returned 404
- https://play.google.com/store/apps/details?id=com.byimplication.sakay
- https://apps.apple.com/ph/app/sakay-ph-commute-directions/id937998546
- https://github.com/sakayph/gtfs — README, LICENSE.md, `dotc` and `master` branches, commit history (via the GitHub API)
- https://bonitotech.com/
- https://en.wikipedia.org/wiki/Sakay.ph — *secondary*

### TrainSight sources
- https://trainsight.app/
- https://trainsight.app/about
- https://trainsight.app/company
- https://trainsight.app/download
- https://rail.trainsight.app/
- https://play.google.com/store/apps/details?id=org.railfansph.mmtraintracker
- https://www.philstar.com/headlines/2026/07/26/2544766/commuter-develops-app-monitor-lrt-mrt-trains — *secondary*

### ikotMNL sources
- https://apps.apple.com/ph/app/ikotmnl-mobile-app/id1455296957
- https://lrmc.ph/ikotmnl/
- https://lrmc.ph/2020/12/17/lrmc-lrta-ink-partnership-for-lrt-2-on-ikotmnl-app/
- https://play.google.com/store/apps/details?id=com.praxxys.ikotmnl — returned "Not Found"

### Moovit sources
- https://play.google.com/store/apps/details?id=com.tranzmate
- https://moovitapp.com/index/en/public_transit-Manila-1022 — blocked automated loading; text seen in search results only
- https://moovitapp.com/index/en/public_transit-lines-Manila-1022-9969 — same
- https://moovitapp.com/index/en/public_transit-line-jeep-Manila-1022-9969-7638080-1 — same

### Google Maps sources
- https://support.google.com/maps/answer/6142130 — transit departures, live info, crowdedness
- https://support.google.com/maps/answer/6291838 — offline maps
- https://support.google.com/transitpartners/answer/1111471 — About Google Transit
- https://eacomm.com/blog/metro-manila-transit-data-in-google-maps/ — the data company's own account of its work; *secondary* for Google's current coverage

### beep™ app sources
- https://beep.com.ph/beep-app/
- News naming AF Payments Inc. (e.g. https://ppp.gov.ph/in_the_news/beep-launches-nfc-tech-based-card-loading/) — *secondary*, seen in search results only

### TRENLigtas sources
- https://projectligtas.com/commute

### Davao Commuters sources
- https://apps.apple.com/ph/app/davao-commuters/id6661032832

### JeepTa sources
- https://www.jeepta.online/

### i-Jeepney sources
- https://i-jeepney.vercel.app/

### Mandaue Commuter Transport Map sources
- https://ctm.goodkredit.com/ → redirects to https://ctm.goodtransport.co/ (title only)
- https://www.sunstar.com.ph/cebu/mandaue-launches-bus-tracking-system — *secondary*

### Also checked — sources
- https://komyut-app.vercel.app/
- https://www.jeepneyroutes.xyz/
- https://apps.apple.com/us/app/ph-railway-transit-mrt-lrt/id6451242789
- https://play.google.com/store/apps/details?id=tech.viscion.lovebus
- https://chalo.com/metromanila
- https://pco.gov.ph/other_releases/dotr-mmda-inaugurate-new-and-improved-edsa-busway-stations-and-smart-traffic-surveillance-system/
- https://www.dotrmrt3.gov.ph/ — seen in search results only
- https://dotr.gov.ph/55-dotrnews/2867-mrt-3-to-soft-launch-contact-tracing-app-on-january-18.html — blocked automated loading; title seen in search results
- https://www.zigwheels.ph/car-news/ltfrb-launches-mobile-app-to-enhance-commuters-safety-in-philippines-21129098 — *secondary*, search results only

### ParaPo's own map provider (for offline and attribution notes)
- https://openfreemap.org/

### Name check sources
- https://podcasts.apple.com/us/podcast/start-up-199-live-para-po-jeepney-navigation-app-in/id1576462394?i=1000682171013
- https://www.facebook.com/officialparapo/ — page name only was readable
- https://www.youtube.com/watch?v=XSBKNn2p0E0 — title and channel via YouTube's oEmbed service
- https://parapo-beta.vercel.app/
- https://github.com/reskydevs/parapo
- https://github.com/a-ldnstntng/para-po
- https://github.com/Ben010618/ParaPo · https://github.com/milk4christian/ParaPo · https://github.com/ekopinedaa/ParaPo · https://github.com/divinefavourak/parapo
- https://play.google.com/store/apps/details?id=com.etaximo.android.clientapp.wlparapo — returned "Not Found"
- https://play.google.com/store/apps/details?id=tech.hitchup.hitch.passenger — returned "Not Found"
- https://apkcombo.com/parapo/tech.hitchup.hitch.passenger/ — *secondary* (mirror site)
- https://itunes.apple.com/search?term=parapo&country=ph&entity=software — Apple search API (also run for "para po" and for the US store)
- https://play.google.com/store/search?q=parapo&c=apps — Google Play search (also run for "para po")
- https://api.github.com/search/repositories?q=parapo — GitHub repository search
- https://apps.apple.com/ph/app/para-pos/id1665720062
- https://app.realparapo.com/
- https://openreview.net/forum?id=Uic3ojVhXh — search results only
- https://soundcloud.com/parapomusic — search results only
- Domains loaded directly: parapo.com, parapo.online, parapo.ph, parapo.com.ph, parapo.app, parapo.org
