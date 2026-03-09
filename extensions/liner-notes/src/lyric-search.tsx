import { useState } from "react";
import { List, LaunchProps, Action, ActionPanel, Icon } from "@raycast/api";
import { useFetch, useLocalStorage } from "@raycast/utils";
import Lyrics from "./Lyrics";
import { HistoryItem } from "./History";
import History from "./History";

interface SearchResults {
  id: number;
  full_title: string;
  url: string;
  header_image_thumbnail_url: string;
}

interface SearchHit {
  result: SearchResults;
  highlights: {
    value: string;
  }[];
}

interface SearchSections {
  hits: SearchHit[];
}

interface SearchResponse {
  sections: SearchSections[];
}

interface QueryResponse {
  response: SearchResponse;
}

export default function Command(props: LaunchProps<{ arguments: Arguments.LyricSearch }>) {
  const [searchQuery, setSearchQuery] = useState(props.arguments.query || "");
  const { data, isLoading } = useFetch<QueryResponse>(
    `https://genius.com/api/search/lyrics?q=${encodeURIComponent(searchQuery)}`,
    {
      keepPreviousData: true,
      execute: searchQuery.length > 0,
    },
  );
  const {
    value: history,
    setValue: setHistory,
    isLoading: isHistoryLoading,
  } = useLocalStorage<HistoryItem[]>("history", []);

  return (
    <List
      isLoading={isLoading || isHistoryLoading}
      searchText={searchQuery}
      onSearchTextChange={setSearchQuery}
      searchBarPlaceholder="Enter lyrics..."
      throttle
    >
      {searchQuery.length === 0 ? (
        <History />
      ) : (
        <>
          {(data?.response?.sections?.[0]?.hits || []).map((hit) => (
            <List.Item
              key={hit.result.id}
              title={hit.result.full_title}
              subtitle={hit.highlights.length > 0 ? `${hit.highlights[0].value.replaceAll("\n", " ")}` : undefined}
              icon={hit.result.header_image_thumbnail_url}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Show Lyrics"
                    icon={Icon.Paragraph}
                    target={<Lyrics url={hit.result.url} title={hit.result.full_title} songId={hit.result.id} />}
                    onPush={() => {
                      const nextHistory = history ?? [];
                      const existingIdx = nextHistory.findIndex(
                        (i) => i.title.toLowerCase() === hit.result.full_title.toLowerCase(),
                      );
                      const viewedAt = Date.now();
                      if (existingIdx !== -1) {
                        setHistory(
                          nextHistory.map((entry, idx) => (idx === existingIdx ? { ...entry, viewedAt } : entry)),
                        );
                      } else {
                        setHistory(
                          nextHistory.concat({
                            title: hit.result.full_title,
                            thumbnail: hit.result.header_image_thumbnail_url,
                            url: hit.result.url,
                            viewedAt,
                          }),
                        );
                      }
                    }}
                  />
                  <Action.OpenInBrowser title="Open in Browser" url={hit.result.url} />
                </ActionPanel>
              }
            />
          ))}
        </>
      )}
    </List>
  );
}
