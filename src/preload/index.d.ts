export interface FileInfo {
    name: string;
    isDirectory: boolean;
    path: string;
    size?: number;
    modifiedAt?: number;
}
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface AIResponse {
    success: boolean;
    response?: string;
    error?: string;
    mode: 'private' | 'incognito';
}
export interface UserProfile {
    identity: {
        name: string;
        role: string;
        years_experience: number;
    };
    preferences: {
        language: string;
        code_style: string;
        response_conciseness: 'high' | 'medium' | 'low';
    };
    privacy_settings: {
        allow_local_indexing: boolean;
        cloud_sync_enabled: boolean;
    };
}
