const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// 🔁 REPLACE THIS WITH YOUR ACTUAL API URL (from Render)
const API_BASE_URL = 'https://animepahe-api-4hpp.onrender.com';

const manifest = {
    id: 'community.animepahe',
    version: '1.0.0',
    name: 'Animepahe',
    description: 'Watch anime from animepahe.si with direct streams',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    idPrefixes: ['animepahe:'],
    catalogs: [
        {
            type: 'series',
            id: 'animepahe-catalog',
            name: 'Animepahe - Airing',
            extra: [{ name: 'search', isRequired: false }]
        }
    ]
};

const builder = new addonBuilder(manifest);

function toStremioMeta(anime) {
    return {
        id: `animepahe:${anime.session}`,
        type: 'series',
        name: anime.title,
        poster: anime.poster,
        background: anime.poster,
        description: `${anime.type} | ${anime.status} | Score: ${anime.score}\n${anime.season} ${anime.year}`,
        releaseInfo: anime.year,
        imdbRating: anime.score,
        genres: [anime.type]
    };
}

builder.defineCatalogHandler(async (args) => {
    try {
        let response;
        if (args.extra && args.extra.search) {
            response = await axios.get(`${API_BASE_URL}/api/search`, {
                params: { q: args.extra.search }
            });
        } else {
            response = await axios.get(`${API_BASE_URL}/api/airing`);
        }
        const metas = response.data.data.map(toStremioMeta);
        return { metas };
    } catch (error) {
        console.error('Catalog error:', error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async (args) => {
    try {
        const session = args.id.replace('animepahe:', '');
        const infoResponse = await axios.get(`${API_BASE_URL}/api/${session}`);
        const releasesResponse = await axios.get(`${API_BASE_URL}/api/${session}/releases`, {
            params: { sort: 'episode_desc', page: 1 }
        });

        const anime = infoResponse.data;
        const episodes = releasesResponse.data.data;

        const meta = toStremioMeta(anime);
        meta.videos = episodes.map((ep) => ({
            id: `animepahe:${session}:${ep.session}`,
            title: `Episode ${ep.episode}`,
            released: new Date().toISOString(),
            season: 1,
            episode: ep.episode,
            overview: `Duration: ${ep.duration || 'Unknown'}`
        }));

        return { meta };
    } catch (error) {
        console.error('Meta error:', error.message);
        return { meta: null };
    }
});

builder.defineStreamHandler(async (args) => {
    try {
        const parts = args.id.replace('animepahe:', '').split(':');
        if (parts.length !== 2) return { streams: [] };

        const [animeSession, episodeSession] = parts;
        const response = await axios.get(`${API_BASE_URL}/api/play/${animeSession}`, {
            params: { episodeId: episodeSession, downloads: true }
        });

        const streams = [];
        if (response.data.sources) {
            response.data.sources.forEach(source => {
                streams.push({
                    name: `Animepahe ${source.quality || 'HD'}`,
                    title: `Animepahe - ${source.quality || 'Auto'} (HLS)`,
                    url: source.url,
                    behaviorHints: { notWebReady: false, bingeGroup: 'animepahe' }
                });
            });
        }
        if (response.data.downloads) {
            response.data.downloads.forEach(download => {
                streams.push({
                    name: `Animepahe DL ${download.quality || 'HD'}`,
                    title: `Download - ${download.quality}p (${download.size || 'Unknown'})`,
                    externalUrl: download.link,
                    behaviorHints: { notWebReady: true, bingeGroup: 'animepahe' }
                });
            });
        }
        return { streams };
    } catch (error) {
        console.error('Stream error:', error.message);
        return { streams: [] };
    }
});

// Use serveHTTP to start the addon – this handles Express internally
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
