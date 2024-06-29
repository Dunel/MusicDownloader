class Tags {
    constructor(data = {}) {
        this.album_artist = data.album_artist || null;
        this.composer = data.composer || null;
        this.track_number = data.track_number || null;
        this.total_tracks = data.total_tracks || null;
        this.copyright = data.copyright || null;
        this.isrc = data.isrc || null;
        this.upc = data.upc || null;
        this.disc_number = data.disc_number || null;
        this.total_discs = data.total_discs || null;
        this.replay_gain = data.replay_gain || null;
        this.replay_peak = data.replay_peak || null;
        this.genres = data.genres || [];
        this.release_date = data.release_date || null;  // Formato: YYYY-MM-DD
        this.description = data.description || null;
        this.comment = data.comment || null;
        this.label = data.label || null;
        this.extra_tags = data.extra_tags || {};
    }
}

const QualityEnum = {
    MINIMUM: 1,
    LOW: 2,
    MEDIUM: 4,
    HIGH: 8,
    LOSSLESS: 16,
    HIFI: 32
};

class OrpheusOptions {
    constructor({ debug_mode, disable_subscription_check, quality_tier, default_cover_options }) {
        this.debug_mode = debug_mode;
        this.disable_subscription_check = disable_subscription_check;
        this.quality_tier = quality_tier;
        this.default_cover_options = default_cover_options;
    }
}

class ModuleController {
    constructor({ module_settings, data_folder, extensions, temporary_settings_controller, orpheus_options, get_current_timestamp, printer_controller, module_error }) {
        this.module_settings = module_settings;
        this.data_folder = data_folder;
        this.extensions = extensions;
        this.temporary_settings_controller = temporary_settings_controller;
        this.orpheus_options = orpheus_options;
        this.get_current_timestamp = get_current_timestamp;
        this.printer_controller = printer_controller;
        this.module_error = module_error;  // Note: You might need to handle this differently based on how it's used
    }
}

class TrackInfo {
    constructor({
        name,
        album,
        album_id,
        artists,
        tags,
        codec,
        cover_url,
        release_year,
        duration = null,
        explicit = null,
        artist_id = null,
        animated_cover_url = null,
        description = null,
        bit_depth = 16,
        sample_rate = 44.1,
        bitrate = null,
        download_extra_kwargs = {},
        cover_extra_kwargs = {},
        credits_extra_kwargs = {},
        lyrics_extra_kwargs = {},
        error = null
    }) {
        this.name = name;
        this.album = album;
        this.album_id = album_id;
        this.artists = artists;
        this.tags = tags;
        this.codec = codec;
        this.cover_url = cover_url;
        this.release_year = release_year;
        this.duration = duration;
        this.explicit = explicit;
        this.artist_id = artist_id;
        this.animated_cover_url = animated_cover_url;
        this.description = description;
        this.bit_depth = bit_depth;
        this.sample_rate = sample_rate;
        this.bitrate = bitrate;
        this.download_extra_kwargs = download_extra_kwargs;
        this.cover_extra_kwargs = cover_extra_kwargs;
        this.credits_extra_kwargs = credits_extra_kwargs;
        this.lyrics_extra_kwargs = lyrics_extra_kwargs;
        this.error = error;
    }
}

const CodecEnum = Object.freeze({
    MP3: 'mp3',
    FLAC: 'flac',
    WAV: 'wav',
    AAC: 'aac',
});

const ContainerEnum = {
    FLAC: 1,
    WAV: 2,
    OPUS: 3,
    OGG: 4,
    M4A: 5,
    MP3: 6
};

export { QualityEnum, Tags, OrpheusOptions, ModuleController, TrackInfo, CodecEnum, ContainerEnum };
