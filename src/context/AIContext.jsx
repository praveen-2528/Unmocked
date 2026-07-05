import React, { createContext, useContext } from 'react';
import { PROVIDERS, DEFAULT_MODELS, DEFAULT_ENDPOINTS, fetchAIResponse } from '../utils/aiProviders';
import { useRoom } from './RoomContext';

const AIContext = createContext();

export const useAI = () => {
    return useContext(AIContext);
};

export const AIProvider = ({ children }) => {
    const { socket } = useRoom();

    // Hardcoded config for Ollama
    const config = {
        provider: PROVIDERS.OLLAMA,
        endpoint: DEFAULT_ENDPOINTS[PROVIDERS.OLLAMA],
        apiKey: '',
        model: 'gemma3:latest' // Local Ollama model
    };

    const generateResponse = async (prompt, systemPrompt = '', images = [], onChunk = null, signal = null) => {
        return await fetchAIResponse(config, prompt, systemPrompt, images, onChunk, signal, socket);
    };

    const value = {
        config,
        generateResponse,
        PROVIDERS,
        DEFAULT_MODELS,
        DEFAULT_ENDPOINTS
    };

    return (
        <AIContext.Provider value={value}>
            {children}
        </AIContext.Provider>
    );
};
