// js/supabase.js - Supabase 연동 및 데이터베이스 작업

// Supabase 클라이언트 초기화 (CDN 방식)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const supabaseService = {
    /**
     * 매장 정보 가져오기
     * @param {string} storeId 
     */
    async getStore(storeId) {
        try {
            const { data, error } = await supabase
                .from('stores')
                .select('*')
                .eq('id', storeId)
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching store:', error);
            return null;
        }
    },

    /**
     * 모든 매장 목록 가져오기
     */
    async getAllStores() {
        try {
            const { data, error } = await supabase
                .from('stores')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching all stores:', error);
            return [];
        }
    },

    /**
     * 새 매장 추가 (INSERT)
     * @param {Object} data 
     */
    async createStore(data) {
        try {
            const { data: result, error } = await supabase
                .from('stores')
                .insert([data])
                .select()
                .single();
            if (error) throw error;
            console.log('Store created successfully:', result);
            return result;
        } catch (error) {
            console.error('Error creating store:', error);
            return null;
        }
    },

    /**
     * 매장 정보 수정 (UPDATE)
     * @param {string} storeId 
     * @param {Object} data 
     */
    async updateStore(storeId, data) {
        try {
            const { data: result, error } = await supabase
                .from('stores')
                .update(data)
                .eq('id', storeId)
                .select()
                .single();
            if (error) throw error;
            console.log('Store updated successfully:', result);
            return result;
        } catch (error) {
            console.error('Error updating store:', error);
            return null;
        }
    },

    /**
     * 분석 결과 저장
     * @param {Object} data 
     */
    async saveAnalysisResult(data) {
        try {
            const { data: result, error } = await supabase
                .from('analysis_history')
                .insert([data])
                .select();
            if (error) throw error;
            console.log('Analysis result saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Error saving analysis result:', error);
            return null;
        }
    },

    /**
     * 분석 이력 가져오기
     * @param {string} storeId 
     */
    async getAnalysisHistory(storeId) {
        try {
            const { data, error } = await supabase
                .from('analysis_history')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching analysis history:', error);
            return [];
        }
    },

    /**
     * 콘텐츠 저장
     * @param {Object} data 
     */
    async saveContent(data) {
        try {
            const { data: result, error } = await supabase
                .from('contents')
                .insert([data])
                .select();
            if (error) throw error;
            console.log('Content saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Error saving content:', error);
            return null;
        }
    },

    /**
     * 콘텐츠 목록 가져오기
     * @param {string} storeId 
     */
    async getContents(storeId) {
        try {
            const { data, error } = await supabase
                .from('contents')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching contents:', error);
            return [];
        }
    }
};
