
export type SearchStateContextType = {
    query: string
    queryIntents: QueryIntentType[]
    isLoading: boolean // are server creating queryIntents?
}


export type QueryIntentType = {
    intent: string
    articles: {
        title: string
    }[]
    isLoading: boolean // are server creating articles?
}

