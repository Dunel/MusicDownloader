'use client';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import ContainerWeb from '../components/ContainerWeb';
import GridContainer from '../components/GridContainer';

export default function TidalAuthPage() {
  const [linkUrl, setLinkUrl] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAuthLink() {
      try {
        const response = await fetch('/api/tidal');
        const data = await response.json();

        if (response.ok) {
          setLinkUrl(data.linkUrl);
        } else {
          setError(data.message || 'An error occurred');
        }
      } catch (err) {
        setError('An error occurred');
      }
    }

    fetchAuthLink();
  }, []);

  useEffect(() => {
    async function pollForTokens() {
      try {
        const response = await fetch('/api/check-tokens');
        const data = await response.json();

        if (response.ok) {
          setTokens(data);
        } else {
          throw new Error(data.message);
        }
      } catch (err) {
        setTimeout(pollForTokens, 30000); // Reintenta después de 30 segundos en caso de error
      }
    }

    if (linkUrl) {
      pollForTokens();
    }
  }, [linkUrl]);

  return (
    <>
      <Header title={"Tidal Downloader"} />
      <ContainerWeb>
        <GridContainer>    
          <h1>Tidal Authentication</h1>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          {linkUrl && !tokens && (
            <div>
              <p>Please log in at: <a href={linkUrl} target="_blank" rel="noopener noreferrer">{linkUrl}</a></p>
              <p>Waiting for authorization...</p>
            </div>
          )}
          {tokens && (
            <div>
              <h2>Tokens received:</h2>
              <p>Access Token: {tokens.accessToken}</p>
              <p>Refresh Token: {tokens.refreshToken}</p>
            </div>
          )}
        </GridContainer>
      </ContainerWeb>
    </>
  );
}
