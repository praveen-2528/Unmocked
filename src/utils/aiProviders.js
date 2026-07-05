/**
 * Helper utilities for making API calls to various AI providers.
 */

export const PROVIDERS = {
    OLLAMA: 'ollama',
    OPENAI_COMPATIBLE: 'openai_compatible',
    GEMINI: 'gemini'
};

export const DEFAULT_MODELS = {
    [PROVIDERS.OLLAMA]: 'qwen3.5:4b',
    [PROVIDERS.OPENAI_COMPATIBLE]: 'gpt-3.5-turbo',
    [PROVIDERS.GEMINI]: 'gemini-1.5-flash'
};

export const DEFAULT_ENDPOINTS = {
    [PROVIDERS.OLLAMA]: '/api/ollama',
    [PROVIDERS.OPENAI_COMPATIBLE]: 'https://api.openai.com/v1/chat/completions',
    [PROVIDERS.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
};

/**
 * Sends a message to the configured AI provider.
 */
export async function fetchAIResponse(config, prompt, systemPrompt = '', images = [], onChunk = null, signal = null, socket = null) {
    const { provider, endpoint, apiKey, model } = config;

    if (!endpoint) throw new Error('API Endpoint is required.');
    if (!model) throw new Error('Model name is required.');

    switch (provider) {
        case PROVIDERS.OLLAMA:
            return await fetchOllama(endpoint, model, prompt, systemPrompt, images, onChunk, signal, socket);
        case PROVIDERS.OPENAI_COMPATIBLE:
            return await fetchOpenAICompatible(endpoint, apiKey, model, prompt, systemPrompt, signal);
        case PROVIDERS.GEMINI:
            return await fetchGemini(apiKey, model, prompt, systemPrompt, signal);
        default:
            throw new Error('Unknown AI provider selected.');
    }
};

async function fetchOllama(endpoint, model, prompt, systemPrompt, images, onChunk, signal, socket) {
    console.log("\n====================================");
    console.log(`🧠 [Ollama] Sending Request to ${model}`);
    console.log(`📜 SYSTEM PROMPT:\n${systemPrompt}`);
    console.log(`👤 USER PROMPT:\n${prompt}`);
    if (images && images.length > 0) {
        console.log(`🖼️ IMAGES INCLUDED: ${images.length}`);
    }
    console.log("====================================\n");

    const bodyData = {
        model: model,
        prompt: prompt,
        system: systemPrompt,
        stream: !!onChunk
    };

    if (images && images.length > 0) {
        bodyData.images = images;
    }

    if (socket && socket.connected) {
        return new Promise((resolve, reject) => {
            let fullResponse = '';
            let buffer = '';
            
            const handleChunk = (data) => {
                buffer += data.chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response !== undefined) {
                                fullResponse += parsed.response;
                                if (onChunk) onChunk(parsed.response);
                            }
                        } catch(e) {}
                    }
                }
            };
            
            const handleDone = () => {
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const parsed = JSON.parse(buffer);
                        if (parsed.response !== undefined) {
                            fullResponse += parsed.response;
                            if (onChunk) onChunk(parsed.response);
                        }
                    } catch(e) {}
                }
                socket.off('ollamaChunk', handleChunk);
                socket.off('ollamaDone', handleDone);
                socket.off('ollamaError', handleError);
                
                if (signal) {
                    signal.removeEventListener('abort', handleAbort);
                }
                
                console.log("\n====================================");
                console.log(`🤖 [Ollama Socket] Final Output:`);
                console.log(fullResponse);
                console.log("====================================\n");
                resolve(fullResponse);
            };
            
            const handleError = (err) => {
                socket.off('ollamaChunk', handleChunk);
                socket.off('ollamaDone', handleDone);
                socket.off('ollamaError', handleError);
                reject(new Error(err.error || "Ollama Socket Error"));
            };
            
            const handleAbort = () => {
                socket.off('ollamaChunk', handleChunk);
                socket.off('ollamaDone', handleDone);
                socket.off('ollamaError', handleError);
                reject(new Error('AbortError'));
            };

            socket.on('ollamaChunk', handleChunk);
            socket.on('ollamaDone', handleDone);
            socket.on('ollamaError', handleError);
            
            if (signal) {
                signal.addEventListener('abort', handleAbort);
            }

            socket.emit('ollamaGenerate', bodyData);
        });
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: signal
    });

    if (!res.ok) {
        throw new Error(`Ollama Error: ${res.statusText}`);
    }

    if (!onChunk) {
        const data = await res.json();
        console.log("\n====================================");
        console.log(`🤖 [Ollama] Final Output:`);
        console.log(data.response || data.message?.content || '');
        console.log("====================================\n");
        return data.response || data.message?.content || '';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop();
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.error) {
                        throw new Error(`Ollama API Error: ${parsed.error}`);
                    }
                    if (parsed.response !== undefined) {
                        fullResponse += parsed.response;
                        onChunk(parsed.response);
                    }
                } catch (e) {
                    if (e.message.startsWith('Ollama API Error')) throw e;
                    console.error("Ollama Stream Parse Error:", e, "Line:", line);
                    // If we receive HTML (e.g. from a proxy error), throw it so the user sees it
                    if (line.toLowerCase().includes('<!doctype html>') || line.toLowerCase().includes('<html>')) {
                        throw new Error("Received HTML error page instead of JSON. The proxy or server might have timed out.");
                    }
                }
            }
        }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
        try {
            const parsed = JSON.parse(buffer);
            if (parsed.error) {
                throw new Error(`Ollama API Error: ${parsed.error}`);
            }
            if (parsed.response !== undefined) {
                fullResponse += parsed.response;
                onChunk(parsed.response);
            }
        } catch (e) {
            if (e.message.startsWith('Ollama API Error')) throw e;
            console.error("Ollama Stream Parse Error (buffer):", e, "Buffer:", buffer);
        }
    }

    if (!fullResponse.trim()) {
        throw new Error("No response generated. The model might have crashed or returned an empty response.");
    }
    
    console.log("\n====================================");
    console.log(`🤖 [Ollama] Final Output:`);
    console.log(fullResponse);
    console.log("====================================\n");
    
    return fullResponse;
}

async function fetchOpenAICompatible(endpoint, apiKey, model, prompt, systemPrompt) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const headers = {
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

async function fetchGemini(apiKey, model, prompt, systemPrompt) {
    if (!apiKey) throw new Error('API Key is required for Gemini.');
    
    let endpoint = DEFAULT_ENDPOINTS[PROVIDERS.GEMINI].replace('{model}', model);
    endpoint += `?key=${apiKey}`;

    const contents = [];
    if (systemPrompt) {
        // Gemini handles system instructions differently in its newer API, 
        // but passing it as the first part of the prompt works generally.
        contents.push({ role: 'user', parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Request: ${prompt}` }] });
    } else {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: contents,
            generationConfig: {
                temperature: 0.7
            }
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini Error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
