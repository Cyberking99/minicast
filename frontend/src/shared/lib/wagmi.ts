import { http, createConfig } from 'wagmi';
import { celoSepolia, localhost } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [celoSepolia, localhost],
  connectors: [
    injected()
  ],
  transports: {
    [celoSepolia.id]: http(),
    [localhost.id]: http(),
  },
});

