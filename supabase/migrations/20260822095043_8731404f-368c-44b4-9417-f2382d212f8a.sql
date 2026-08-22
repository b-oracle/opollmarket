UPDATE public.profiles
SET avatar_url = 'https://gateway.pinata.cloud/ipfs/' || substring(avatar_url from 'ipfs\.io/ipfs/(.*)$'),
    updated_at = now()
WHERE avatar_url LIKE '%ipfs.io/ipfs/%';