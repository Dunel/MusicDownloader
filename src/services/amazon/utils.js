import axios from 'axios';

export function divideList(inputList, chunkSize) {
    const result = [];
    for (let i = 0; i < inputList.length; i += chunkSize) {
        result.push(inputList.slice(i, i + chunkSize));
    }
    return result;
}

export function raiseResponseException(response) {
    throw new Error(`Request failed with status code ${response.status}: ${response.data}`);
}

const responseCache = new Map();

export async function getResponseBytesCached(url) {
    if (responseCache.has(url)) {
        return responseCache.get(url);
    }
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    responseCache.set(url, response.data);
    return response.data;
}
