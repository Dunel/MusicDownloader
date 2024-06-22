// model.js

export class DownloadQueueItem {
    constructor(metadataAlbum = null, metadataTrack = null) {
        this.metadataAlbum = metadataAlbum;
        this.metadataTrack = metadataTrack;
    }
}

export class StreamInfo {
    constructor(streamUrl = null, psshsEntitlement = null, psshWidevine = null, kid = null, codec = null, sampleRate = null) {
        this.streamUrl = streamUrl;
        this.psshsEntitlement = psshsEntitlement;
        this.psshWidevine = psshWidevine;
        this.kid = kid;
        this.codec = codec;
        this.sampleRate = sampleRate;
    }
}

export class UrlInfo {
    constructor(country = null, asin = null, playlistId = null) {
        this.country = country;
        this.asin = asin;
        this.playlistId = playlistId;
    }
}

export class Lyrics {
    constructor(unsynced = null, synced = null) {
        this.unsynced = unsynced;
        this.synced = synced;
    }
}

// Codec Enum
export const Codec = {
    FLAC_HD: "flac.HD",
    OPUS_SD: "opus.SD",
    OPUS_LD: "opus.LD",
    EAC3_3D: "ec-3.3D",
    MHM1_3D: "mhm1.3D",
    AC_4_3D: "ac-4.3D",
    MHA1_3D: "mha1.3D"
};

// DownloadMode Enum
export const DownloadMode = {
    YTDLP: "ytdlp",
    ARIA2C: "aria2c"
};

// RemuxMode Enum
export const RemuxMode = {
    FFMPEG: "ffmpeg",
    MP4BOX: "mp4box",
    MP4DECRYPT: "mp4decrypt"
};

// Country Enum
export const Country = {
    AUTO: "auto",
    ACCOUNT: "account"
};
