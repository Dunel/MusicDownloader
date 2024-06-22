import { DOMParser } from 'xmldom-qsa';

/**
 * @typedef {Object} CoverArtwork
 * @property {string} url
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Artist
 * @property {string | number} id
 * @property {string} url
 * @property {string[]} [pictures]
 * @property {string} name
 * @property {Album[]} [albums]
 * @property {Track[]} [tracks]
 */

/**
 * @typedef {Object} Album
 * @property {string} title
 * @property {string | number} id
 * @property {string} url
 * @property {string} [upc]
 * @property {number} [trackCount]
 * @property {number} [discCount]
 * @property {Date} [releaseDate]
 * @property {CoverArtwork[]} [coverArtwork]
 * @property {Artist[]} [artists]
 */

/**
 * @typedef {Object} Track
 * @property {string} title
 * @property {string | number} id
 * @property {string} url
 * @property {boolean} [explicit]
 * @property {number} [trackNumber]
 * @property {number} [discNumber]
 * @property {string} [copyright]
 * @property {Artist[]} artists
 * @property {string} [isrc]
 * @property {string[]} [producers]
 * @property {string[]} [composers]
 * @property {string[]} [lyricists]
 * @property {Album} [album]
 * @property {number} [durationMs]
 * @property {CoverArtwork[]} [coverArtwork]
 */

/**
 * @typedef {Object} RawArtist
 * @property {string} id
 * @property {string} [url]
 * @property {string} name
 * @property {string} [picture]
 */

/**
 * @typedef {Object} RawAlbum
 * @property {string} cover
 * @property {number} id
 * @property {string} url
 * @property {number} [numberOfTracks]
 * @property {number} [numberOfVolumes]
 * @property {string} title
 * @property {RawArtist[]} [artists]
 * @property {string} [upc]
 * @property {string} [releaseDate]
 */

/**
 * @typedef {Object} RawTrack
 * @property {string} url
 * @property {number} id
 * @property {RawArtist[]} artists
 * @property {number} duration
 * @property {string} copyright
 * @property {string} [isrc]
 * @property {string[]} [producers]
 * @property {string[]} [composers]
 * @property {string[]} [lyricists]
 * @property {boolean} [explicit]
 * @property {number} [trackNumber]
 * @property {number} [volumeNumber]
 * @property {string} title
 * @property {RawAlbum} album
 */

/**
 * @typedef {Object} Contributor
 * @property {string} name
 * @property {string} role
 */

/**
 * @typedef {Object} ContributorsByType
 * @property {string} type
 * @property {{ name: string, id: number }[]} contributors
 */

/**
 * @param {RawArtist} raw
 * @returns {Artist}
 */
export function parseArtist(raw) {
	let picturePath;

	if (raw?.picture != null) picturePath = raw?.picture?.replace(/-/gm, '/');
	else picturePath = null;
	const artist = {
		id: raw.id,
		url: raw.url ?? `https://www.tidal.com/artist/${raw.id}`,
		name: raw.name
	};
	if (picturePath)
		artist.pictures = [
			`https://resources.tidal.com/images/${picturePath}/160x160.jpg`,
			`https://resources.tidal.com/images/${picturePath}/320x320.jpg`,
			`https://resources.tidal.com/images/${picturePath}/750x750.jpg`
		];
	return artist;
}

/**
 * @param {RawAlbum} raw
 * @returns {Album}
 */
export function parseAlbum(raw) {
	let coverPath;

	if (raw.cover) coverPath = raw.cover.replace(/-/gm, '/');
	else coverPath = null;

	const album = {
		id: raw.id,
		url: raw.url ?? `https://tidal.com/browse/album/${raw.id}`,
		title: raw.title,
		coverArtwork: []
	};

	if (coverPath)
		album.coverArtwork = [
			{
				url: `https://resources.tidal.com/images/${coverPath}/160x160.jpg`,
				width: 160,
				height: 160
			},
			{
				url: `https://resources.tidal.com/images/${coverPath}/320x320.jpg`,
				width: 320,
				height: 320
			},
			{
				url: `https://resources.tidal.com/images/${coverPath}/1280x1280.jpg`,
				width: 1280,
				height: 1280
			}
		];
	if (raw.upc) album.upc = raw.upc;
	if (raw.artists) album.artists = raw.artists.map(parseArtist);
	if (raw.numberOfTracks) album.trackCount = raw.numberOfTracks;
	if (raw.numberOfVolumes) album.discCount = raw.numberOfVolumes;
	if (raw.releaseDate) album.releaseDate = new Date(raw.releaseDate);
	return album;
}

/**
 * @param {RawTrack} raw
 * @returns {Track}
 */
export function parseTrack(raw) {
	const track = {
		url: raw.url,
		id: raw.id,
		title: raw.title,
		durationMs: raw.duration * 1000,
		artists: raw.artists.map(parseArtist),
		album: parseAlbum(raw.album)
	};
	if (raw.producers) track.producers = raw.producers;
	if (raw.composers) track.composers = raw.composers;
	if (raw.lyricists) track.lyricists = raw.lyricists;
	if (raw.isrc) track.isrc = raw.isrc;
	if (raw.copyright) track.copyright = raw.copyright;
	if (raw.explicit) track.explicit = raw.explicit;
	if (raw.trackNumber) track.trackNumber = raw.trackNumber;
	if (raw.volumeNumber) track.discNumber = raw.volumeNumber;
	return track;
}

/**
 * @param {RawTrack} raw
 * @param {Contributor[] | ContributorsByType[]} credits
 * @returns {RawTrack}
 */
export function addCredits(raw, credits) {
	if (credits.length > 0 && 'type' in credits[0]) {
		credits = credits
			.map((group) => {
				return group.contributors.map((contributor) => {
					return {
						name: contributor.name,
						role: group.type
					};
				});
			})
			.flat();
	}
	for (const contributor of credits) {
		switch (contributor.role) {
			case 'Producer':
				if (!raw.producers) raw.producers = [];
				raw.producers.push(contributor.name);
				break;
			case 'Composer':
				if (!raw.composers) raw.composers = [];
				raw.composers.push(contributor.name);
				break;
			case 'Lyricist':
				if (!raw.lyricists) raw.lyricists = [];
				raw.lyricists.push(contributor.name);
				break;
			default:
				break;
		}
	}
	return raw;
}

/**
 * @param {string} mpdString
 * @returns {string[]}
 */
export function parseMpd(mpdString) {
	const tracks = [];
	const { documentElement: doc } = new DOMParser().parseFromString(mpdString, 'application/xml');
	for (const adaptationSet of [...doc.querySelectorAll('AdaptationSet')]) {
		const contentType = adaptationSet.getAttribute('contentType');
		if (contentType != 'audio') throw new Error('Lucida only supports audio MPDs');
		for (const rep of [...doc.querySelectorAll('Representation')]) {
			let codec = rep.getAttribute('codecs')?.toLowerCase();
			if (codec?.startsWith('mp4a')) codec = 'aac';
			const segTemplate = rep.querySelector('SegmentTemplate');
			if (!segTemplate) throw new Error('No SegmentTemplate found');
			const initializationUrl = segTemplate.getAttribute('initialization');
			if (!initializationUrl) throw new Error('No initialization url');
			const mediaUrl = segTemplate.getAttribute('media');
			if (!mediaUrl) throw new Error('No media url');
			const trackUrls = [];
			const timeline = segTemplate.querySelector('SegmentTimeline');
			if (timeline) {
				const timeList = [];
				for (const s of [...timeline.querySelectorAll('S')]) {
					const r = parseInt(s.getAttribute('r') || '0') + 1;
					if (!s.getAttribute('d')) throw new Error('No d property on SegmentTimeline');
					for (let i = 0; i < r; i++) {
						timeList.push(0);
					}
				}
				for (const i in timeList) {
					trackUrls.push(mediaUrl.replace('$Number$', i));
				}
			}
			tracks.push(trackUrls);
		}
	}
	return tracks[0];
}
