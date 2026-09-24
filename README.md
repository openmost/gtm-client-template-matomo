# Matomo Client for server-side Google Tag Manager

**Make your Matomo tracking first-party.** This server-side GTM **Client** serves the Matomo tracker from your own domain and receives every tracking request in your server container, so that browsers never talk to your Matomo instance directly.

Use it together with the [**Matomo** tag template](https://github.com/openmost/gtm-tag-template-matomo-server), which forwards the hits to Matomo.

Authored by Ronan HELLO — [Openmost](https://openmost.com). License: Apache 2.0.

---

## Contents

1. [Why use it](#why-use-it)
2. [How it works](#how-it-works)
3. [Requirements](#requirements)
4. [Quick start (10 minutes)](#quick-start-10-minutes)
5. [Connect your website](#connect-your-website)
6. [Settings reference](#settings-reference)
7. [Features in detail](#features-in-detail)
8. [Event data reference](#event-data-reference)
9. [Using Matomo hits in other tags](#using-matomo-hits-in-other-tags)
10. [Limitations](#limitations)
11. [Troubleshooting](#troubleshooting)
12. [FAQ](#faq)
13. [For developers](#for-developers)

---

## Why use it

| Without this client | With this client |
|---|---|
| The browser loads `matomo.js` from `analytics.example.com` and sends hits there | Everything goes through **your own domain** (e.g. `sgtm.example.com`) |
| Ad blockers and privacy extensions often block known analytics domains | Requests look like any other first-party request |
| The URL of your Matomo instance is public | Your Matomo instance stays private |
| Hits go straight into Matomo, as sent by the browser | You can **check, filter, enrich or strip** every hit in your server container before it reaches Matomo |
| Only Matomo receives the data | The same hits can also feed other server-side tags (Google Ads, Meta CAPI…) |

What is supported:

- the Matomo JavaScript tracker (`matomo.js`), including premium plugins bundled in it: **FormAnalytics, MediaAnalytics, A/B Testing, CrashAnalytics**;
- page views, events, site search, outlinks, downloads, content tracking, goals, **ecommerce** (product views, carts, orders), custom dimensions, User ID, page performance, heartbeat;
- every way `matomo.js` sends data: GET, `sendBeacon`, XHR POST and **bulk** requests;
- **Matomo Tag Manager** containers;
- the Matomo **opt-out** script;
- **A/B Testing redirect** experiments.

Heatmaps & Session Recording are intentionally not supported (see [Limitations](#limitations)).

---

## How it works

```
                    your domain (server-side GTM)
browser ─────────► ┌──────────────────────────────────────────────┐
  matomo.js        │  Matomo Client                               │
  hits             │   • serves matomo.js (cached)                │
                   │   • answers the browser (204 / GIF, CORS)    │
                   │   • 1 event per hit ──► server container ─┐  │
                   └───────────────────────────────────────────┼──┘
                                                               │
                         ┌─────────────────────────────────────┴────────────┐
                         │  Matomo tag  ──► POST matomo.php ──► Matomo       │
                         │  (optional) Google Ads, Meta CAPI… tags           │
                         └───────────────────────────────────────────────────┘
```

1. The browser loads `matomo.js` from your server-side GTM domain. The client fetches it once from your Matomo instance and caches it.
2. `matomo.js` sends its tracking requests to your server-side GTM domain.
3. The client reads each request, splits bulk requests into individual hits, and runs your server container **once per hit, in the original order**.
4. The **Matomo** tag, triggered by this client, sends each hit to Matomo with the real visitor IP.

> The client itself sends **nothing** to Matomo. Without the Matomo tag, no data reaches your Matomo instance.

---

## Requirements

- A **server-side Google Tag Manager** container, reachable on a domain you control (ideally a subdomain of your website, e.g. `sgtm.example.com`). Stape, Google Cloud Run and App Engine all work.
- A **Matomo** instance (On-Premise or Cloud), version 4, 5 or 6.
- The [**Matomo** tag template](https://github.com/openmost/gtm-tag-template-matomo-server) in the same server container, with a Matomo `token_auth`.

---

## Quick start (10 minutes)

### 1. Add the templates to your server container

In your **server** container: *Templates → Client Templates → New → ⋮ → Import* and pick `template.tpl` from this repository (or add it from the Community Template Gallery). Do the same for the **Matomo** tag template under *Tag Templates*.

### 2. Create the client

*Clients → New → Matomo Client*:

| Field | Example |
|---|---|
| Matomo instance URL | `https://analytics.example.com` |
| Public path of the tracker JS | `/matomo.js` (or a neutral path such as `/js/app.js`) |
| Public path of the tracking endpoint | `/matomo.php` (or e.g. `/collect`) |

Leave the other fields as they are for now.

### 3. Create the Matomo tag

*Tags → New → Matomo*:

| Field | Value |
|---|---|
| Tracking type | Automatic |
| Matomo instance URL | `https://analytics.example.com` |
| Auth token | a `token_auth` of a user with at least *write* access to your site(s) |
| Trigger | *Custom* → **Client Name equals `Matomo Client`** (the name you gave the client) |

### 4. Publish the container

*Submit → Publish*. Allow one or two minutes for the new version to be picked up by all server instances.

### 5. Point your website to your server-side domain

See [Connect your website](#connect-your-website): in most cases, you only change **two URLs** in your Matomo snippet.

### 6. Check

- Open `https://sgtm.example.com/matomo.js` in your browser: you should see the Matomo JavaScript code.
- Browse your website, then open *Matomo → Visitors → Visits Log*: your visit appears in real time, with your real location.

---

## Connect your website

### Option A — Matomo JavaScript snippet (in your site or in a GTM web container)

Replace your Matomo URL with your server-side GTM URL in the snippet. That's all: every `_paq.push(...)` call keeps working, including the [Openmost web templates](https://github.com/openmost) for events, goals, site search and custom dimensions.

With the default paths:

```html
<script>
  var _paq = window._paq = window._paq || [];
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function() {
    var u = 'https://sgtm.example.com/';          // was: 'https://analytics.example.com/'
    _paq.push(['setTrackerUrl', u + 'matomo.php']);
    _paq.push(['setSiteId', '1']);
    var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
    g.async = true; g.src = u + 'matomo.js'; s.parentNode.insertBefore(g, s);
  })();
</script>
```

With custom paths (e.g. `/js/app.js` and `/collect`), adapt the two lines:

```js
_paq.push(['setTrackerUrl', u + 'collect']);
g.src = u + 'js/app.js';
```

### Option B — Matomo Tag Manager

1. Tick **Proxy Matomo Tag Manager containers** in the client.
2. In Matomo Tag Manager, edit the **Matomo Configuration** variable:
   - **Matomo URL**: `https://sgtm.example.com`
   - in the advanced settings, set a custom **JS endpoint** and **tracking endpoint** if you changed the default paths (e.g. `js/app.js` and `collect`).
3. Publish the Matomo Tag Manager container.
4. Load the container from your server-side domain:

```html
<script>
  var _mtm = window._mtm = window._mtm || [];
  _mtm.push({'mtm.startTime': (new Date().getTime()), 'event': 'mtm.Start'});
  (function() {
    var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
    g.async = true; g.src = 'https://sgtm.example.com/js/container_XXXXXXXX.js'; s.parentNode.insertBefore(g, s);
  })();
</script>
```

### Option C — Opt-out on your privacy page

Tick **Proxy the Matomo opt-out script**, take the opt-out code from *Matomo → Administration → Privacy → Users opt-out*, and replace your Matomo URL with your server-side URL:

```html
<div id="matomo-opt-out"></div>
<script src="https://sgtm.example.com/index.php?module=CoreAdminHome&action=optOutJS&divId=matomo-opt-out&language=auto&showIntro=1"></script>
```

### Content Security Policy

If your website sends a CSP header, allow your server-side domain in `script-src` and `connect-src`. You can remove your Matomo domain.

---

## Settings reference

| Field | Default | Description |
|---|---|---|
| **Matomo instance URL** | — (required) | Base URL of your Matomo instance, e.g. `https://analytics.example.com`. Used to fetch `matomo.js`, Matomo Tag Manager containers, the opt-out script and A/B redirects. |
| **Public path of the tracker JS** | `/matomo.js` | Path of your server-side domain that serves `matomo.js`. A neutral path such as `/js/app.js` is less likely to be blocked. |
| **Public path of the tracking endpoint** | `/matomo.php` | Path that receives tracking hits. Must match `setTrackerUrl` in your snippet. |
| **Tracker JS cache duration (hours)** | `12` | How long `matomo.js` is kept in the server cache and in browsers. |
| **Allowed origins** | empty = any | Comma-separated list of websites allowed to send hits from a browser, e.g. `https://www.example.com, https://shop.example.com`. Other origins get a `403`. |
| **Allowed Matomo site IDs** | empty = any | Comma-separated list of numeric site IDs, e.g. `1, 3`. Hits for other sites are silently dropped. Empty accepts any site, exactly like Matomo itself. No wildcards. |
| **Proxy Matomo Tag Manager containers** | off | Serves `/js/container_XXXX.js` from your Matomo instance. |
| **Matomo Tag Manager container cache duration (minutes)** | `5` | Cache of published containers. Preview containers (`container_XXXX_preview.js`) are never cached, so the MTM preview mode keeps working. |
| **Proxy the Matomo opt-out script** | off | Serves `/index.php?module=CoreAdminHome&action=optOutJS…`. No other Matomo page is exposed. |
| **Proxy A/B Testing redirect experiments** | off | Relays `/plugins/AbTesting/redirect.php`, used by A/B tests of type "redirect". |

---

## Features in detail

### Tracker JavaScript

- `matomo.js` is fetched from `<Matomo URL>/matomo.js` and cached. It already contains the code of the premium plugins installed on your instance (FormAnalytics, MediaAnalytics, A/B Testing, CrashAnalytics…).
- If your Matomo instance is temporarily unavailable, the last cached copy keeps being served.
- If Matomo answers with something that is not JavaScript (an HTML maintenance page, for instance), it is neither served nor cached: the browser gets a `502`.

### Tracking requests

| What `matomo.js` sends | Handled |
|---|---|
| GET with parameters in the URL | ✅ |
| `sendBeacon` POST with parameters in the URL and an empty body (default behaviour of `matomo.js`) | ✅ |
| POST with parameters in the body (long requests, XHR) | ✅ |
| **Bulk** POST `{"requests": [...]}` (content tracking, FormAnalytics, MediaAnalytics, CrashAnalytics queues) | ✅ one event per hit |
| CORS preflight `OPTIONS` | ✅ `204` with CORS headers |

Responses mimic Matomo: `204 No Content` for normal hits, a 1×1 GIF for image requests (GET without `send_image=0`), `Cache-Control: no-store`, and CORS headers echoing the origin (required because `matomo.js` sends credentials).

Hits of one request are processed **one after the other**, so that Matomo attaches them to the same visit in the right order.

### Plugins

| Plugin | Status |
|---|---|
| FormAnalytics | ✅ (`fa_*` parameters forwarded untouched) |
| MediaAnalytics | ✅ (`ma_*` parameters and media events) |
| A/B Testing | ✅ (experiment events; redirect experiments with the dedicated option) |
| CrashAnalytics | ✅ (`cra*` parameters) |
| Custom Dimensions, Custom Variables, Page Performance, Bandwidth… | ✅ forwarded untouched |
| Heatmaps & Session Recording | ❌ ignored (see [Limitations](#limitations)) |
| Funnels, Cohorts, Users Flow, Custom Reports, Multi Channel Attribution… | ✅ nothing to do: they are computed from the data Matomo already receives |

### Consent

`matomo.js` sends an empty visitor ID until cookie consent is given (`requireCookieConsent`, `disableCookies`). The client turns this into a simple signal on every event: `x-matomo-consent` = `granted` or `denied` (see [Event data reference](#event-data-reference)). The Matomo tag uses it automatically; you can use it in the triggers of your other tags.

### Security

- `token_auth` sent by a browser is removed from every hit.
- Parameters that only work with a token (`cip`, `cdt`, `cdo`, `country`, `region`, `city`, `lat`, `long`) are removed from every hit coming from a browser. The Matomo tag adds a token when forwarding hits, so without this, anyone could backdate visits or fake locations through your container. `matomo.js` never sends these parameters, so real tracking is not affected.
- **Allowed Matomo site IDs** and **Allowed origins** let you restrict what can be sent through your container.
- The opt-out proxy only relays the `optOutJS` action, and the Tag Manager proxy only relays files named `container_<letters, digits, _>.js`.

---

## Event data reference

Each hit becomes one event in your server container.

### `event_name`

| Matomo hit | `event_name` |
|---|---|
| page view | `page_view` |
| site search | `view_search_results` |
| event (`trackEvent`) | `matomo_event` |
| A/B Testing event | `matomo_abtesting` |
| outlink | `click` |
| download | `file_download` |
| ecommerce order | `purchase` |
| ecommerce cart update | `update_cart` |
| goal conversion | `matomo_goal` |
| content impression / interaction | `matomo_content` |
| heartbeat (`ping`) | `matomo_ping` |
| FormAnalytics | `matomo_form` |
| MediaAnalytics | `matomo_media` |
| CrashAnalytics | `matomo_crash` |

### Common fields

| Key | Content |
|---|---|
| `page_location` | page URL |
| `page_title` | page title (`action_name`) |
| `page_referrer` | referrer |
| `client_id` | Matomo visitor ID (`_id`), empty without cookie consent |
| `user_id` | Matomo User ID |
| `ip_override` | visitor IP address |
| `user_agent` | browser user agent |
| `language` | browser language |
| `screen_resolution` | e.g. `1920x1080` |

### Fields by hit type

| `event_name` | Extra fields |
|---|---|
| `purchase` | `transaction_id`, `value` (Matomo revenue), `tax`, `shipping`, `discount`, `items` |
| `update_cart` | `value`, `items` |
| `page_view` of a product or category page | `items` |
| `matomo_goal` | `goal_id`, `value` |
| `view_search_results` | `search_term`, `search_category`, `search_total` |
| `matomo_event` | `event_category`, `event_action`, `event_label`, `value` |
| `matomo_abtesting` | `experiment`, `variation` |
| `matomo_content` | `content_name`, `content_piece`, `content_target`, `content_interaction` |
| `click`, `file_download` | `link_url` (and `outbound: true` for clicks) |

`items` follow the GA4 format: `item_id`, `item_name`, `item_category` … `item_category5`, `price`, `quantity`.

### Matomo-specific fields

| Key | Content |
|---|---|
| `x-matomo-hit` | **all** parameters of the original hit, decoded. The Matomo tag replays it without losing anything. |
| `x-matomo-idsite` | Matomo site ID |
| `x-matomo-consent` | `granted` when the hit carries a visitor ID (cookie consent given, `consent=1`, or a `mtm_cookie_consent` / `mtm_consent` cookie), otherwise `denied` |
| `x-matomo-request` | request context forwarded to Matomo: `referer`, `dnt`, client hints (`sec-ch-ua*`) and the `matomo_ignore` cookie (`ignore_cookie`) |

---

## Using Matomo hits in other tags

Because every hit is a standard server-side event, other tags of your server container can use it, for example a **Google Ads** or **Meta Conversions API** tag triggered on `purchase`.

Respect your visitors' choices: add the condition **`x-matomo-consent` equals `granted`** to those triggers (create an *Event Data* variable on the key `x-matomo-consent`).

---

## Limitations

- **Heatmaps & Session Recording** are not proxied. They load their configuration from `plugins/HeatmapSessionRecording/configs.php` and send very large payloads that do not belong in a server container. Their hits are ignored; if the plugin is active on your site, it simply stops recording.
- **Cookie lifetime**: `_pk_id` is still set by `matomo.js` in the browser. Safari limits cookies set by JavaScript to 7 days, with or without this client.
- **Google Analytics 4**: this client is made to feed Matomo. It does not produce GA4 sessions.
- The response is sent once all tags have run for all hits of the request; keep your tags fast.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `https://sgtm.example.com/matomo.js` returns **400** | No client claimed the request: the container version with this client is not published yet, or the path does not match the *Public path of the tracker JS* (it must start with `/`). After publishing, wait one or two minutes. |
| `matomo.js` returns **502** | The client could not get JavaScript from `<Matomo URL>/matomo.js`. Check the *Matomo instance URL* and that the instance is reachable from your server container. The preview console shows the status and content type received. |
| Hits return **204** but nothing appears in Matomo | The client never sends data to Matomo itself: check that the **Matomo** tag fires on this client (trigger *Client Name*), and look at its outgoing request in the server preview. Also check *Allowed Matomo site IDs*. |
| Hits of one site end up in another site | The Matomo tag has *Override the site ID of Matomo Client hits* ticked. Untick it. |
| Browser console shows CORS errors | The page origin is not in *Allowed origins*. |
| Nothing is tracked on some pages | Your CSP blocks the server-side domain (`script-src`, `connect-src`), or an old snippet still points to your Matomo instance. |
| Matomo Tag Manager container is outdated | Published containers are cached for *Matomo Tag Manager container cache duration*. Lower it, or wait. |

To see exactly what happens, open the **Preview** of your server container: each hit appears as an event with its `x-matomo-hit`, and the Matomo tag shows the request sent to Matomo and its status.

---

## FAQ

**Do I have to change my Matomo configuration?**
No. Matomo keeps working as before; only the browser-facing URLs change.

**Do my existing visitors keep their visitor ID?**
Yes. The Matomo cookies are set on your website's domain by `matomo.js`, not by this client.

**Does it work with several websites?**
Yes. One client and one Matomo tag handle all sites of your Matomo instance; use *Allowed Matomo site IDs* and *Allowed origins* to restrict them if you want.

**Can I keep sending some sites directly to Matomo?**
Yes. Only the pages whose snippet points to your server-side domain go through the client.

**Is it compatible with the CNIL consent exemption?**
The client does not change what `matomo.js` collects: configure Matomo as you would without it (IP anonymisation, cookie consent…). The server side adds the ability to strip or block data before it reaches Matomo.

---

## For developers

- The template (code, parameters, permissions and unit tests) is in `template.tpl`. Open it in the GTM template editor; the tests run from the **Tests** tab.
- Issues and pull requests are welcome.

## License

Apache 2.0 — see [LICENSE](LICENSE).
