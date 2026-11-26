> **WORKING DRAFT — NOT FOR PUBLICATION YET**
> This is a working translation of `polityka-prywatnosci.pl.md`. **The Polish version is the legal master text; this translation is for internal reference only** and must not be published as a standalone legal document without being reconciled with the final Polish version and reviewed by a Polish/EU data-protection lawyer. Controller details below are **placeholders** — the company is not yet registered.

---

**Privacy Policy — ZR (Złota Rączka)**

This Privacy Policy describes how personal data is processed by **[COMPANY NAME IN FORMATION — to be completed after registration]**, with its registered office in Gdynia, [address], NIP: [●], KRS: [●] (hereinafter: **"ZR"**, **"Controller"** or **"we"**), to the extent we process such data as controller within the meaning of Art. 4(7) GDPR.

Until the company is registered, contact for data-protection matters: **[email address to be added — a dedicated address such as privacy@... or contact@... is recommended, not a personal mailbox]**.

## I. Who we are and what ZR is

ZR is a booking platform for home-repair and maintenance craftsmen ("Masters") — calendar availability search, booking, communication, and post-service reviews.

ZR does **not** itself perform the Master's Services — these are performed by an independent Master under a separate contract concluded directly with the Client upon booking confirmation. ZR operates the platform that facilitates the conclusion and performance of that contract.

Payment for the Master's Services takes place **off-platform**, directly between the Client and the Master — ZR does not process payment-card data and is not an intermediary in payments.

## II. Our role as data controller

1. ZR is the controller of Masters' personal data (natural persons using the Master Panel) in relation to running their account on the platform.
2. ZR is the controller of Clients' personal data to the extent such data is processed in connection with using the platform (account, booking history, reviews, communication).
3. To the extent a Master uses Client data shared by ZR solely to perform the booked Service (e.g. a phone call to arrange arrival), the Master becomes an independent, separate controller of that data and is responsible for its own GDPR compliance — ZR is not responsible for how a Master processes Client data off-platform.
4. ZR does not currently act as a data processor on behalf of Masters — this model may be introduced later as platform features expand (e.g. Master marketing tools), with Masters notified separately via an update to this Policy.

## III. What data we process and why

### A. Client data

| Category | Examples | Purpose | Legal basis (GDPR) |
|---|---|---|---|
| Identification/contact | name, phone number, email (optional) | account/booking management, order-related contact | Art. 6(1)(b) — contract performance / pre-contractual steps |
| Order data | description of the service needed, service address, chosen time slot | enabling booking and the Master's arrival | Art. 6(1)(b) |
| Voice recording (optional) | a short recording when the Client uses the microphone button | turning speech into text in a form field; the recording is not stored or logged, the text only goes into the field the Client sends himself | Art. 6(1)(b) |
| Review content | rating, text comment, up to 3 photos | building platform trust, public display of reviews | Art. 6(1)(f) — legitimate interest of ZR and other users in review credibility |
| Communication data | SMS content with review link, notifications | handling the booking/review process | Art. 6(1)(b) |
| Technical data | IP address, device identifier, language preference | platform operation and security | Art. 6(1)(f) |
| Consent to the Terms and Policy | date and time the box in the booking form was ticked | documenting acceptance of the Terms | Art. 6(1)(b), 6(1)(f) — legitimate interest (proof of contract) |
| Confirmation of completed work | answer “done / there is a problem” and the problem description | settling the service, handling complaints | Art. 6(1)(b), 6(1)(f) |
| Data remembered on the Client's device | order history (in the app), name and phone to prefill the form, chosen city, position rounded to ~100 m | convenience; the data is **not sent to the server** unless the Client uses the distance feature | Art. 6(1)(a)/(f) |

### B. Master data

| Category | Examples | Purpose | Legal basis (GDPR) |
|---|---|---|---|
| Identification/contact | name, phone number, login, password hash | running the Master account/Panel | Art. 6(1)(b) |
| Services and pricing | service list, prices, duration | presenting the Master's offer to Clients | Art. 6(1)(b)/(f) |
| Location data | device location — only while the Master Panel is open (foreground), or in the mobile app in the background **after separate opt-in consent** | showing Clients the Master's approximate position/ETA | Art. 6(1)(a) — consent (background location) / Art. 6(1)(b) (foreground, necessary for the "on my way" feature) |
| Telegram identifier (chat_id) | linked via a one-time link, never entered manually | sending new-booking notifications | Art. 6(1)(b) |
| Push token (FCM) | mobile device identifier | sending push notifications | Art. 6(1)(b) |
| Analytics data | booking stats, rating, review count | analytics panel for the Master and platform admin | Art. 6(1)(f) |
| Consent to the Terms | date and time of acceptance at first login | documenting acceptance | Art. 6(1)(b), 6(1)(f) |
| Private notes and blacklist about Clients | preference note, reason for an entry (e.g. did not pay, did not open the door), comment — entered by the Master | supporting the Master's work; visible only to him, not shared with other Masters or used by the Operator; an entry only warns | data created by the Master (as controller) — Art. 6(1)(f) on the Master's side |

> **To verify with counsel (new features, 27.11.2026):** (a) whether a Master keeping private notes and a blacklist in the Panel makes the Operator a processor (data processing agreement, Art. 28 GDPR); (b) whether the automatic cancellation after 15 minutes and hiding of reviews need additional provisions (Art. 22 GDPR — decisions supported by hints but made by a human); (c) validity of accepting the Terms by ticking a box with a stored timestamp.

### C. Technical data (all users) — see also the Cookie Policy (Section V)

IP address, device/browser type, login-session data (e.g. session token), language preference (pl/ru/uk/en), usage data for platform security and proper operation — Art. 6(1)(f).

### D. Review moderation and automatic hints

To protect the credibility of ratings, the platform administrator sees reviews together with automatic hints (the same phone number posted 2 or more reviews; a review posted less than an hour after the order was placed; a Client number matching the Master's number) and may hide a review. Hints have no automatic effect — a human decides. Orders entered by a Master in the calendar do not generate a review invitation. Basis: Art. 6(1)(f). An order not confirmed by the Master within 15 minutes is cancelled automatically (Art. 6(1)(b)); this is neither profiling nor a decision significantly affecting the Client.

## IV. Who we share data with (recipients / processors)

Data may be passed to organisations that help us provide the service and act on our behalf under data processing agreements (Art. 28 GDPR) or, for public services, under their own terms. The specific providers are named below.

| Recipient | Purpose | Data | Location / transfer |
|---|---|---|---|
| **Render** (Render Services, Inc.) | hosting of the app and website | all data passing through the app; server logs (IP, time, request URL) | USA (company); server region: **[to be completed]** |
| **Neon** (Neon, Inc.) | PostgreSQL database | the whole database: bookings, Client and Master data, reviews | AWS data centre in Frankfurt (EU, eu-central-1); US company |
| **OpenAI** (OpenAI, USA) | (a) writing notification texts; (b) speech recognition; (c) matching services to a task description | (a) Client's name and phone, service name, time, city, where relevant the Client's words about a problem; (b) voice recording — only to turn it into text; (c) the task description text. We do not keep recordings, recognised text or task descriptions | USA — **transfer outside the EEA** |
| **Google Firebase Cloud Messaging** (Google) | push notifications in the mobile app | device token, notification title and text | USA / global — **transfer outside the EEA** |
| **Telegram** | notifications to the Master (voluntary, requires the Master to link their account) | the Master's chat ID, notification text | global — **transfer outside the EEA** |
| **Twilio** (Twilio Inc.) or a Polish SMS gateway **[provider choice: to be decided]** | SMS to Clients (confirmation, review link) — **currently switched off** | the Client's phone number, SMS text | USA (Twilio) — **transfer outside the EEA**; relevant only once SMS is launched |
| **Photon** (komoot GmbH) and **Nominatim** (OpenStreetMap Foundation) | converting an address typed by the Client into coordinates to show the distance to the Master | the typed address; the IP address of the ZR server (not the Client's). We do not store the address | Germany / United Kingdom |
| **OpenStreetMap** (map tiles) | displaying the map with the Master's position | IP address and the map area viewed in the Client's browser | United Kingdom and OSM servers |
| **zlecai** (a separate project of the same owner, a job dispatcher) | showing ZR Masters to people looking for a handyman | active Masters: name, phone number (if entered on the Master's card), rating, review count, approximate location (if enabled), booking link | see agreement / Master's consent **[to be completed]** |
| Apple App Store / Google Play | distribution of the mobile app (once published) | installation data under the stores' terms | depends on the store |
| Public authorities | only where required by applicable law | scope stated in the request | PL |

Notification texts are written by the language model of the provider named above (currently OpenAI; the configuration allows switching to another provider — we will then update this list). Only the facts needed for the message text are sent to the model.

ZR does not sell personal data and does not share it with third parties for their own marketing purposes.

> To verify before publication: (1) the Render server region; (2) for every provider outside the EEA (OpenAI, Google, Telegram, Twilio, Render, Neon) — the transfer basis: a European Commission adequacy decision (e.g. the provider's EU-US Data Privacy Framework certification — check its current status), Standard Contractual Clauses (SCC) or another; (3) concluding or accepting data processing agreements (DPA) with processors; (4) the basis and Masters' consent for sharing data with zlecai.

## V. Cookie policy

See the separate document: **ZR Cookie Policy** (`cookie-policy.en.md`), describing cookie categories, purposes, and how consent is managed. This Privacy Policy refers to that document for data collected via cookies that constitutes personal data.

## VI. Retention periods

- Client/Master account data — for as long as the account is active, and after deletion for the period needed to defend against claims (typically 3 years — the general civil-claim limitation period, to be confirmed with counsel depending on claim type).
- Booking content and related communication — for as long as needed to settle the service and handle complaints, then per claim-limitation periods.
- Reviews — for as long as the reviewed Master's account exists, unless the Client requests earlier deletion (see rights in Section VII) and no overriding interest in retention applies (e.g. protection against unjustified removal of negative reviews).
- Technical data/logs — maximum [●] months *(to be set — typically 6–12 months)*.
- Data needed for tax records — once the company is registered, 5 years per tax law.

## VII. Your rights

You have the right to:

- access your data and obtain a copy,
- rectify (correct) your data,
- erasure ("right to be forgotten"), to the extent provided by law,
- restrict processing,
- data portability,
- object to processing based on Art. 6(1)(f) (legitimate interest),
- withdraw consent at any time — without affecting the lawfulness of processing carried out before withdrawal (where consent is the basis, e.g. background location, marketing, certain cookies),
- lodge a complaint with the supervisory authority — the **President of the Personal Data Protection Office (UODO)** (ul. Stawki 2, 00-193 Warsaw, Poland).

To exercise these rights, write to the contact address given at the top of this Policy.

## VIII. Voluntariness of providing data

Providing data necessary for a booking (e.g. phone number, service address) is voluntary but necessary to conclude and perform the contract — without it, booking is not possible. Consent to background location, marketing communication, or certain cookies is entirely voluntary and does not affect the ability to use the platform's core functions.

## IX. Changes to this Policy

This Policy may be updated, in particular as platform features evolve, providers change, or applicable law changes. We will notify users of material changes in the customary way (e.g. an in-app/website notice).

Last updated: [●].
