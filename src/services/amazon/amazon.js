import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { COUNTRIES } from "./enum";
import { divideList, raiseResponseException } from "./utils";
import axios from "axios";

class AmazonMusicApi {
  constructor(
    cookiesPath = "./src/services/amazon/cookies.txt",
    metadataLanguage = "en_US"
  ) {
    this.LOOKUP_API_URL =
      "https://music.amazon.com/{continent}/api/muse/legacy/lookup";
    this.PLAYLIST_API_URL =
      "https://music.amazon.com/{continent}/api/playlists/getPlaylistsByIdV2";
    this.MANIFEST_API_URL = "https://music.amazon.com/{continent}/api/dmls/";
    this.LYRICS_API_URL = "https://music.amazon.com/{continent}/api/xray/";
    this.LICENSE_API_URL = "https://music.amazon.com/{continent}/api/dmls/";
    this.SEARCH_API_URL =
      "https://music.amazon.com/{continent}/api/textsearch/search/v1_1/";
    this.MUSE_PAGE_API_URL =
      "https://music.amazon.com/{continent}/api/musepage/page";
    this.WAIT_TIME = 3;

    this.cookiesPath = cookiesPath;
    this.metadataLanguage = metadataLanguage;
    this.session = null;
    this.appConfig = null;
  }

  async _setSession() {
    try {
      const rawCookies = this._getRawCookies();
      //console.log("rawCookies: ", rawCookies);
      const domain = this._getDomain(rawCookies);
      if (!domain) throw new Error("Invalid cookies");
  
      const cookies = this._getCookies(rawCookies);
      //console.log("Cookies to header: ", this._cookiesToHeader(cookies));
      this.session = {
        headers: {
          Cookie: this._cookiesToHeader(cookies),
        },
      };
      //console.log("Session cookie: ", this.session.headers.Cookie);
  
      const homePageUrl = `https://music${domain}`;
      const axiosCookies = axios.create({
        withCredentials: true
      })
      axiosCookies.interceptors.request.use(config => {
        config.headers['Cookie'] = this.session.headers.Cookie
        return config
      }, error => {
        return Promise.reject(error);
      }
    )
      const homePage = await axiosCookies.get(homePageUrl);
      const homePageText = homePage.data;
  
      //console.log("Fragmento del HTML de la página principal:", homePageText.substring(0, 2000));
  
      const appConfigMatch = homePageText.match(/appConfig\s*:\s*({.*})\s*,/s);
      //no console.log("testttttttt: " + appConfigMatch)
  
      if (!appConfigMatch) {
        console.error("Unable to find appConfig in the homePage HTML. Attempting to find a broader match...");
        const broaderMatch = homePageText.match(/({.*?})\s*,/s);
        if (broaderMatch) {
          console.log("Found a broader match, but unable to confirm it's appConfig.");
        } else {
          throw new Error("Unable to find any JSON-like structure in the HTML.");
        }
      } else {
        const appConfigStr = appConfigMatch[1];
        //console.log("appConfig JSON string:", appConfigStr);
        try {
          this.appConfig = JSON.parse(appConfigStr);
        } catch (jsonParseError) {
          console.error("Error parsing appConfig JSON:", jsonParseError.message);
          throw jsonParseError;
        }
  
        if (!this.appConfig.customerId || this.appConfig.customerId === "") {
          //console.error("customerId is missing in appConfig:", this.appConfig);
          //throw new Error("customerId is required but not found in appConfig.");
        }
  
        this.session.headers = {
          ...this.session.headers,
          "user-agent": this._getMaestroUserAgent(true),
          "csrf-token": this.appConfig.csrf.token,
          "csrf-rnd": this.appConfig.csrf.rnd,
          "csrf-ts": this.appConfig.csrf.ts,
        };
        //console.log("Session initialized with headers:", this.session.headers);
      }
    } catch (error) {
      console.error("Error setting session:", error);
      throw error;
    }
  }
  
  _getRawCookies() {
    const cookieFile = path.resolve(this.cookiesPath);
    if (!fs.existsSync(cookieFile)) {
      throw new Error(`Cookie file not found: ${cookieFile}`);
    }

    const cookies = fs.readFileSync(cookieFile, "utf-8").split("\n");
    return cookies
      .map((line) => {
        if (!line || line.startsWith("#")) return null;
        const parts = line.split("\t");
        return { name: parts[5], value: parts[6], domain: parts[0] };
      })
      .filter((cookie) => cookie);
  }

  _getDomain(rawCookies) {
    const domainCookie = rawCookies.find((cookie) =>
      cookie.domain.includes(".amazon")
    );
    return domainCookie ? domainCookie.domain : null;
  }

  _getCookies(rawCookies) {
    return rawCookies.reduce((acc, cookie) => {
      if (cookie.domain.includes(".amazon")) acc[cookie.name] = cookie.value;
      return acc;
    }, {});
  }

  _cookiesToHeader(cookies) {
    return Object.entries(cookies)
      .map(
        ([key, value]) => `${key}=${value}`
      )
      .join("; ");
  }

  _getMaestroUserAgent(addUuid = false) {
    const randomHexValue = (length) =>
      [...Array(length)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");
    const uuid = `${randomHexValue(2)}-${randomHexValue(
      2
    )}-dmcp-${randomHexValue(2)}-${randomHexValue(2)}${randomHexValue(4).slice(
      4,
      5
    )}`;
    let agent = `Maestro/1.0 WebCP/${this.appConfig.version}`;
    if (addUuid) agent += ` (${uuid})`;
    return agent;
  }

  async getMetadata(
    asin,
    country = null,
    features = ["hasLyrics", "expandTracklist", "fullAlbumDetails"],
  ) {
    if (!this.session) await this._setSession();

    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;

    const requestBody = {
      asins: Array.isArray(asin) ? asin : [asin],
      requestedContent: "FULL_CATALOG",
      features: features,
      deviceType: this.appConfig.deviceType,
      musicTerritory: country,
      metadataLang: this.metadataLanguage,
    };

    //console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      this.LOOKUP_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target":
            "com.amazon.musicensembleservice.MusicEnsembleService.lookup",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const metadata = await response.json();

    // Imprime el contenido de la respuesta para depuración
    //console.log("Metadata response:", metadata);

    if (
      !metadata.albumList &&
      !metadata.trackList &&
      !metadata.playlistList &&
      !metadata.artistList
    ) {
      throw new Error("Invalid metadata response");
    }

    return metadata;
  }

  async *getPlaylist(playlistId, country = null) {
    if (!this.session) await this._setSession();

    playlistId = Array.isArray(playlistId) ? playlistId : [playlistId];
    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;
    const playlistIdDivided = divideList(playlistId, 100);
    for (const [index, _playlistId] of playlistIdDivided.entries()) {
      yield await this._getPlaylist(_playlistId, country, continent);
      if (index !== playlistIdDivided.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.WAIT_TIME));
      }
    }
  }

  async _getPlaylist(playlistIds, country, continent) {
    const response = await fetch(
      this.PLAYLIST_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target":
            "com.amazon.musicplaylist.model.MusicPlaylistService.getPlaylistsByIdV2",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Encoding": "amz-1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentEncoding: true,
          customerId: this.appConfig.customerId,
          deviceId: this.appConfig.deviceId,
          deviceType: this.appConfig.deviceType,
          musicTerritory: country,
          playlistIds,
        }),
      }
    );

    const playlist = await response.json();
    if (!playlist.playlists) {
      raiseResponseException(response);
    }
    return playlist;
  }

  /*async *getManifest(asin, try3dAsinSubstitution = false, country = null) {
    if (!this.session) await this._setSession();

    country = country || this.appConfig.musicTerritory;
    const continent = country
      ? COUNTRIES[country].continent
      : this.appConfig.siteRegion;
    asin = Array.isArray(asin) ? asin : [asin];
    const asinDivided = divideList(asin, 10);
    for (const [index, _asin] of asinDivided.entries()) {
      yield await this._getManifest(
        _asin,
        try3dAsinSubstitution,
        country,
        continent
      );
      if (index !== asinDivided.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.WAIT_TIME));
      }
    }
  }*/

  async getManifest(asin, country = null, try3dAsinSubstitution = false) {
    if (!this.session) await this._setSession();

    country = country || this.appConfig.musicTerritory;
    const continent = country
      ? COUNTRIES[country].continent
      : this.appConfig.siteRegion;
    asin = Array.isArray(asin) ? asin : [asin];
    const asinDivided = divideList(asin, 10);
    const manifestResults = [];

    for (const [index, _asin] of asinDivided.entries()) {
      const manifest = await this._getManifest(
        _asin,
        try3dAsinSubstitution,
        country,
        continent
      );
      manifestResults.push(manifest);
      if (index !== asinDivided.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.WAIT_TIME));
      }
    }

    return manifestResults;
  }

  /*async _getManifest(asins, try3dAsinSubstitution, country, continent) {
    const response = await fetch(
      this.MANIFEST_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target":
            "com.amazon.digitalmusiclocator.DigitalMusicLocatorServiceExternal.getDashManifestsV2",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Encoding": "amz-1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appInfo: {
            musicAgent: this._getMaestroUserAgent(),
          },
          customerId: this.appConfig.customerId,
          deviceToken: {
            deviceTypeId: this.appConfig.deviceType,
            deviceId: this.appConfig.deviceId,
          },
          appMetadata: {
            https: "true",
          },
          clientMetadata: {
            clientId: "WebCP",
          },
          contentIdList: asins.map((asin) => ({
            identifier: asin,
            identifierType: "ASIN",
          })),
          try3dAsinSubstitution,
        }),
      }
    );

    const manifest = await response.json();
    if (
      !manifest.contentResponseList ||
      manifest.contentResponseList.some((response) => !response.manifest)
    ) {
      raiseResponseException(response);
    }
    return manifest;
  }*/

    async _getManifest(asins, try3dAsinSubstitution, country, continent) {
      // Verifica si customerId está presente
      if (!this.appConfig.customerId) {
          throw new Error("Customer ID is required but not found in appConfig.");
      }
  
      const requestBody = {
          appInfo: {
              musicAgent: this._getMaestroUserAgent(),
          },
          customerId: this.appConfig.customerId,
          deviceToken: {
              deviceTypeId: this.appConfig.deviceType,
              deviceId: this.appConfig.deviceId,
          },
          appMetadata: {
              https: "true",
          },
          clientMetadata: {
              clientId: "WebCP",
          },
          contentIdList: asins.map((asin) => ({
              identifier: asin,
              identifierType: "ASIN",
          })),
          musicDashVersionList: ["SIREN_KATANA"],
          contentProtectionList: ["GROUP_PSSH", "TRACK_PSSH"],
          customerInfo: {
              marketplaceId: this.appConfig.marketplaceId || "",
              territoryId: country,
          },
          tryAsinSubstitution: true,
          try3dAsinSubstitution: try3dAsinSubstitution,
      };
  
      //console.log("Request body:", JSON.stringify(requestBody, null, 2));
      //console.log("Headers:", this.session.headers);
  
      try {
          const response = await fetch(
              this.MANIFEST_API_URL.replace("{continent}", continent),
              {
                  method: "POST",
                  headers: {
                      ...this.session.headers,
                      "X-Amz-Target": "com.amazon.digitalmusiclocator.DigitalMusicLocatorServiceExternal.getDashManifestsV2",
                      "X-Requested-With": "XMLHttpRequest",
                      "Content-Encoding": "amz-1.0",
                      "Content-Type": "application/json",
                  },
                  body: JSON.stringify(requestBody),
              }
          );
  
          if (!response.ok) {
              console.error(`Request failed with status code ${response.status}: ${response.statusText}`);
              raiseResponseException(response);
          }
  
          const manifest = await response.json();
          if (
              !manifest.contentResponseList ||
              manifest.contentResponseList.some((response) => !response.manifest)
          ) {
              throw new Error("Invalid manifest response");
          }
          return manifest;
      } catch (error) {
          console.error("Error in _getManifest:", error);
          throw error;
      }
  }
  
  async getLyrics(asin, country = null) {
    if (!this.session) await this._setSession();
  
    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;
    asin = Array.isArray(asin) ? asin : [asin];
    const asinDivided = divideList(asin, 25);
    const results = [];
  
    for (const [index, _asin] of asinDivided.entries()) {
      const lyrics = await this._getLyrics(_asin, country, continent);
      results.push(lyrics);
      if (index !== asinDivided.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.WAIT_TIME));
      }
    }
  
    return results;
  }
  
  async _getLyrics(asins, country, continent) {
    const asinsRequest = asins.map((asin) => ({
      asin,
      musicTerritory: country,
    }));
    const response = await fetch(
      this.LYRICS_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target":
            "com.amazon.musicxray.MusicXrayService.getLyricsByTrackAsinBatch",
          "Content-Encoding": "amz-1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackAsinsAndMarketplaceList: asinsRequest,
        }),
      }
    );
  
    const lyrics = await response.json();
    if (
      !lyrics.lyricsResponseList ||
      lyrics.lyricsResponseList.some(
        (lr) => !lr.lyrics && lr.lyricsResponseCode !== 2001
      )
    ) {
      throw new Error("Response exception: Invalid lyrics response");
    }
    return lyrics;
  }

  async getWidevineLicense(challenge, country = null) {
    if (!this.session) await this._setSession();

    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;
    const response = await fetch(
      this.LICENSE_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target":
            "com.amazon.digitalmusiclocator.DigitalMusicLocatorServiceExternal.getLicenseForPlaybackV2",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Encoding": "amz-1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          DrmType: "WIDEVINE",
          licenseChallenge: challenge,
          customerId: this.appConfig.customerId,
          deviceToken: {
            deviceTypeId: this.appConfig.deviceType,
            deviceId: this.appConfig.deviceId,
          },
          appInfo: {
            musicAgent: this._getMaestroUserAgent(),
          },
        }),
      }
    );

    const license = await response.json();
    if (!license.license) {
      raiseResponseException(response);
    }
    return license;
  }

  async getSearchResults(query, country = null, searchTypes = ["catalog_album"], limit = 10) {
    if (!this.session) await this._setSession();
    //console.log(`Searching ${query} for ${country}...`);return

    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;
    const resultSpecs = searchTypes.map((searchType) => ({
        contentRestrictions: {
            allowedParentalControls: { hasExplicitLanguage: true },
            assetQuality: { quality: [] },
            contentTier: "UNLIMITED",
            eligibility: null,
        },
        documentSpecs: [
            {
                fields: [
                    "__default",
                    "parentalControls.hasExplicitLanguage",
                    "contentTier",
                    "artOriginal",
                    "contentEncoding",
                ],
                filters: null,
                type: searchType,
            },
        ],
        label: searchType,
        maxResults: limit,
        pageToken: null,
        topHitSpec: null,
    }));

    const response = await axios.post(
      this.SEARCH_API_URL.replace("{continent}", continent),
      {
          customerIdentity: {
              customerId: this.appConfig.customerId,
              deviceId: this.appConfig.deviceId,
              deviceType: this.appConfig.deviceType,
              musicRequestIdentityContextToken: null,
              sessionId: "123-1234567-5555555",
          },
          explain: null,
          features: {
              spellCorrection: {
                  accepted: null,
                  allowCorrection: true,
                  rejected: null,
              },
              spiritual: null,
              upsell: {
                  allowUpsellForCatalogContent: false,
              },
          },
          musicTerritory: country,
          query,
          locale: this.metadataLanguage,
          queryMetadata: null,
          resultSpecs,
      },
      {
          headers: {
              ...this.session.headers,
              "X-Amz-Target": "com.amazon.tenzing.textsearch.v1_1.TenzingTextSearchServiceExternalV1_1.search",
              "Content-Encoding": "amz-1.0",
              "Content-Type": "application/json",
          }
      }
  );

    if (response.status !== 200) {
      console.log("estatus: " + response.status)
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const searchResults = await response.data;
    if (!searchResults.results) {
        throw new Error('No search results found');
    }

    return searchResults;
}

  async *getArtistReleases(artistAsin, country = null) {
    if (!this.session) await this._setSession();

    country = country || this.appConfig.musicTerritory;
    const continent = COUNTRIES[country].continent;
    let nextToken = null;
    do {
      const artistReleases = await this._getArtistReleases(
        artistAsin,
        nextToken,
        country,
        continent
      );
      yield artistReleases;
      nextToken = artistReleases.content.blocks[0].content.nextToken;
      if (nextToken) {
        await new Promise((resolve) => setTimeout(resolve, this.WAIT_TIME));
      }
    } while (nextToken);
  }

  async _getArtistReleases(artistAsin, nextToken, country, continent) {
    const response = await fetch(
      this.MUSE_PAGE_API_URL.replace("{continent}", continent),
      {
        method: "POST",
        headers: {
          ...this.session.headers,
          "X-Amz-Target": "com.amazon.musicensembleservice.page",
          "Content-Encoding": "amz-1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceType: this.appConfig.deviceType,
          musicTerritory: country,
          Operation: "page",
          allowedParentalControls: {
            hasExplicitLanguage: true,
          },
          requestedContent: "FULL_CATALOG",
          contentFeatures: [],
          uri: `uri://artist/${artistAsin}/chronological-albums`,
          locale: this.metadataLanguage,
          nextToken,
        }),
      }
    );

    const artistReleases = await response.json();
    if (!artistReleases.content) {
      raiseResponseException(response);
    }
    return artistReleases;
  }
}

export default AmazonMusicApi;
