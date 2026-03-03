import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  closeMainWindow,
  confirmAlert,
  Form,
  Icon,
  List,
  LocalStorage,
  open,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { useEffect, useRef, useState } from "react";

type ResponseAction =
  | "raycast-toast"
  | "copy-to-clipboard"
  | "macos-notification"
  | "raycast-hud"
  | "close-raycast-window"
  | "open-url";

type Webhook = {
  id: string;
  name: string;
  url: string;
  responseActions?: ResponseAction[];
};

type WebhookDraft = {
  name: string;
  url: string;
};

type ResponseActionOption = {
  id: ResponseAction;
  title: string;
  icon: Icon;
};

const STORAGE_KEY = "webhooks";
const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_PREVIEW_LIMIT = 200;
const DEFAULT_WEBHOOK_RESPONSE_ACTIONS: ResponseAction[] = ["raycast-toast"];
const LEGACY_WEBHOOK_ACTIONS: ResponseAction[] = ["copy-to-clipboard", "macos-notification", "raycast-toast"];
const RESPONSE_ACTION_OPTIONS: ResponseActionOption[] = [
  { id: "raycast-toast", title: "Show Raycast Toast Notification", icon: Icon.AppWindow },
  { id: "raycast-hud", title: "Show Raycast HUD", icon: Icon.Eye },
  { id: "close-raycast-window", title: "Close Raycast Window", icon: Icon.XMarkCircle },
  { id: "open-url", title: "Open URL (for valid links)", icon: Icon.Globe },
  { id: "copy-to-clipboard", title: "Copy Response to Clipboard", icon: Icon.Clipboard },
  { id: "macos-notification", title: "Show macOS Notification", icon: Icon.Bell },
];
const runAppleScript = promisify(execFile);

export default function ManageWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const webhooksRef = useRef<Webhook[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    webhooksRef.current = webhooks;
  }, [webhooks]);

  async function loadData() {
    setIsLoading(true);

    try {
      const storedWebhooks = await LocalStorage.getItem<string>(STORAGE_KEY);
      setWebhooks(parseStoredWebhooks(storedWebhooks));
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load webhooks",
        message: getErrorMessage(error),
      });
      setWebhooks([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function persistWebhooks(nextWebhooks: Webhook[]) {
    const sortedWebhooks = [...nextWebhooks].sort((left, right) => left.name.localeCompare(right.name));
    webhooksRef.current = sortedWebhooks;
    setWebhooks(sortedWebhooks);
    await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(sortedWebhooks));
  }

  async function createWebhook(draft: WebhookDraft) {
    await persistWebhooks([
      ...webhooksRef.current,
      {
        id: randomUUID(),
        name: draft.name.trim(),
        url: draft.url.trim(),
        responseActions: [...DEFAULT_WEBHOOK_RESPONSE_ACTIONS],
      },
    ]);
  }

  async function updateWebhook(id: string, draft: WebhookDraft) {
    await persistWebhooks(
      webhooksRef.current.map((webhook) =>
        webhook.id === id
          ? {
              ...webhook,
              name: draft.name.trim(),
              url: draft.url.trim(),
            }
          : webhook,
      ),
    );
  }

  async function deleteWebhook(id: string) {
    const webhook = webhooksRef.current.find((candidate) => candidate.id === id);
    if (!webhook) {
      return;
    }

    const confirmed = await confirmAlert({
      title: `Delete "${webhook.name}"?`,
      message: "This removes the saved webhook URL.",
      primaryAction: {
        title: "Delete Webhook",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    await persistWebhooks(webhooksRef.current.filter((candidate) => candidate.id !== id));
    await showToast({
      style: Toast.Style.Success,
      title: "Webhook deleted",
      message: webhook.name,
    });
  }

  async function addWebhookResponseAction(id: string, action: ResponseAction) {
    const webhook = webhooksRef.current.find((candidate) => candidate.id === id);
    if (!webhook) {
      return;
    }

    const currentActions = getWebhookResponseActions(webhook);
    if (currentActions.includes(action)) {
      return;
    }

    await persistWebhooks(
      webhooksRef.current.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              responseActions: [...currentActions, action],
            }
          : candidate,
      ),
    );
    await showToast({
      style: Toast.Style.Success,
      title: "Webhook action added",
      message: `${webhook.name}: ${getResponseActionOption(action).title}`,
    });
  }

  async function removeWebhookResponseAction(id: string, action: ResponseAction) {
    const webhook = webhooksRef.current.find((candidate) => candidate.id === id);
    if (!webhook) {
      return;
    }

    const nextActions = getWebhookResponseActions(webhook).filter((candidate) => candidate !== action);
    await persistWebhooks(
      webhooksRef.current.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              responseActions: nextActions,
            }
          : candidate,
      ),
    );
    await showToast({
      style: Toast.Style.Success,
      title: "Webhook action removed",
      message: `${webhook.name}: ${getResponseActionOption(action).title}`,
    });
  }

  async function runWebhook(webhook: Webhook) {
    const progressToast = await showToast({
      style: Toast.Style.Animated,
      title: `Running ${webhook.name} webhook...`,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      progressToast.title = "Waiting for response...";
      progressToast.message = webhook.url;

      const response = await fetch(webhook.url, {
        method: "GET",
        signal: controller.signal,
      });

      const body = await response.text();

      if (!response.ok) {
        progressToast.style = Toast.Style.Failure;
        progressToast.title = `Request failed (${response.status})`;
        progressToast.message = truncateResponse(body) || response.statusText;
        await showToast({
          style: Toast.Style.Failure,
          title: `Request failed (${response.status})`,
          message: truncateResponse(body) || response.statusText,
        });
        return;
      }

      const responseMessage = getResponseMessage(body);
      await runResponseActions(webhook, responseMessage);
      progressToast.style = Toast.Style.Success;
      progressToast.title = webhook.name;
      progressToast.message = truncateResponse(responseMessage);
    } catch (error) {
      progressToast.style = Toast.Style.Failure;
      progressToast.title = `Request failed for ${webhook.name}`;
      progressToast.message = getErrorMessage(error);
      await showToast({
        style: Toast.Style.Failure,
        title: `Request failed for ${webhook.name}`,
        message: getErrorMessage(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search saved webhooks">
      <List.Section title="Webhooks" subtitle={String(webhooks.length)}>
        {webhooks.map((webhook) => (
          <List.Item
            key={webhook.id}
            icon={Icon.Link}
            title={webhook.name}
            subtitle={webhook.url}
            accessories={getResponseActionAccessories(getWebhookResponseActions(webhook))}
            actions={
              <ActionPanel>
                <Action title="Run Webhook" icon={Icon.Play} onAction={() => void runWebhook(webhook)} />
                <Action.Push
                  title="Edit Webhook"
                  icon={Icon.Pencil}
                  target={<WebhookForm webhook={webhook} onSubmit={(draft) => updateWebhook(webhook.id, draft)} />}
                />
                <Action.Push
                  title="Edit Response Actions"
                  icon={Icon.Gear}
                  target={
                    <WebhookResponseActionsScreen
                      webhook={webhook}
                      onAddAction={addWebhookResponseAction}
                      onRemoveAction={removeWebhookResponseAction}
                    />
                  }
                />
                <Action.CopyToClipboard title="Copy URL" content={webhook.url} />
                <Action
                  title="Delete Webhook"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => void deleteWebhook(webhook.id)}
                />
                <Action.Push icon={Icon.Plus} title="Create Webhook" target={<WebhookForm onSubmit={createWebhook} />} />
                <Action title="Reload" icon={Icon.ArrowClockwise} onAction={loadData} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

function WebhookResponseActionsScreen(props: {
  webhook: Webhook;
  onAddAction: (id: string, action: ResponseAction) => Promise<void>;
  onRemoveAction: (id: string, action: ResponseAction) => Promise<void>;
}) {
  const [actions, setActions] = useState<ResponseAction[]>(getWebhookResponseActions(props.webhook));

  useEffect(() => {
    setActions(getWebhookResponseActions(props.webhook));
  }, [props.webhook]);

  const availableActions = RESPONSE_ACTION_OPTIONS.filter((option) => !actions.includes(option.id));

  async function handleAddAction(action: ResponseAction) {
    if (actions.includes(action)) {
      return;
    }

    setActions((currentActions) => [...currentActions, action]);
    await props.onAddAction(props.webhook.id, action);
  }

  async function handleRemoveAction(action: ResponseAction) {
    setActions((currentActions) => currentActions.filter((candidate) => candidate !== action));
    await props.onRemoveAction(props.webhook.id, action);
  }

  return (
    <List navigationTitle={`${props.webhook.name} Actions`}>
      <List.Section title="Enabled Actions" subtitle={String(actions.length)}>
        {actions.length === 0 ? (
          <List.Item
            icon={Icon.MinusCircle}
            title="No response actions"
            subtitle="This webhook will only fetch the response until you add an action."
          />
        ) : (
          actions.map((action) => {
            const option = getResponseActionOption(action);

            return (
              <List.Item
                key={action}
                icon={option.icon}
                title={option.title}
                actions={
                  <ActionPanel>
                    <Action
                      title="Remove Action"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => void handleRemoveAction(action)}
                    />
                  </ActionPanel>
                }
              />
            );
          })
        )}
      </List.Section>
      <List.Section title="Add Action">
        {availableActions.length === 0 ? (
          <List.Item
            icon={Icon.CheckCircle}
            title="All Actions Added"
            subtitle="There are no more response actions available to add."
          />
        ) : (
          availableActions.map((option) => (
            <List.Item
              key={option.id}
              icon={option.icon}
              title={option.title}
              actions={
                <ActionPanel>
                  <Action title="Add Action" icon={Icon.Plus} onAction={() => void handleAddAction(option.id)} />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}

function WebhookForm(props: {
  webhook?: Webhook;
  onSubmit: (draft: WebhookDraft) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: WebhookDraft) {
    setIsSubmitting(true);

    try {
      await props.onSubmit(values);
      await showToast({
        style: Toast.Style.Success,
        title: props.webhook ? "Webhook updated" : "Webhook created",
        message: values.name.trim(),
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: props.webhook ? "Failed to update webhook" : "Failed to create webhook",
        message: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      navigationTitle={props.webhook ? "Edit Webhook" : "Create Webhook"}
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={props.webhook ? "Save Changes" : "Create Webhook"}
            icon={props.webhook ? Icon.Checkmark : Icon.Plus}
            onSubmit={(values) => void handleSubmit(values as WebhookDraft)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Daily Status"
        defaultValue={props.webhook?.name}
        info="Used as the label for the saved webhook and the notification title."
      />
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com/webhook"
        defaultValue={props.webhook?.url}
        info="A GET request will be sent to this URL when you run the webhook."
      />
    </Form>
  );
}

function parseStoredWebhooks(storedValue: string | undefined) {
  if (!storedValue) {
    return [];
  }

  const parsedValue = JSON.parse(storedValue) as unknown;
  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .filter(isStoredWebhook)
    .map((webhook) => ({
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      responseActions: parseResponseActions(webhook.responseActions),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseResponseActions(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalizedActions = value.filter(isResponseAction);
  return Array.from(new Set(normalizedActions));
}

function isStoredWebhook(value: unknown): value is { id: string; name: string; url: string; responseActions?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.url === "string";
}

function isResponseAction(value: unknown): value is ResponseAction {
  return RESPONSE_ACTION_OPTIONS.some((option) => option.id === value);
}

function getWebhookResponseActions(webhook: Webhook) {
  return webhook.responseActions ?? LEGACY_WEBHOOK_ACTIONS;
}

function getResponseActionOption(action: ResponseAction) {
  return RESPONSE_ACTION_OPTIONS.find((option) => option.id === action) ?? RESPONSE_ACTION_OPTIONS[0];
}

function getResponseActionAccessories(actions: ResponseAction[]) {
  return actions.map((action) => ({
    icon: getResponseActionOption(action).icon,
  }));
}

function getShortResponseActionLabel(action: ResponseAction) {
  switch (action) {
    case "raycast-toast":
      return "Toast";
    case "copy-to-clipboard":
      return "Clipboard";
    case "close-raycast-window":
      return "Close";
    case "open-url":
      return "Open URL";
    case "raycast-hud":
      return "HUD";
    case "macos-notification":
      return "macOS";
  }
}

function getResponseActionsSummary(actions: ResponseAction[]) {
  return actions.map((action) => getShortResponseActionLabel(action)).join(", ");
}

async function runResponseActions(webhook: Webhook, responseMessage: string) {
  const responseActions = getWebhookResponseActions(webhook);

  for (const action of responseActions) {
    switch (action) {
      case "copy-to-clipboard":
        await Clipboard.copy(responseMessage);
        break;
      case "close-raycast-window":
        await closeMainWindow();
        break;
      case "open-url":
        await openResponseUrl(responseMessage);
        break;
      case "raycast-hud":
        await showHUD(truncateResponse(responseMessage));
        break;
      case "macos-notification":
        await showMacNotification(webhook.name, responseMessage);
        break;
      case "raycast-toast":
        await showToast({
          style: Toast.Style.Success,
          title: webhook.name,
          message: truncateResponse(responseMessage),
        });
        break;
    }
  }
}

function truncateResponse(body: string) {
  const singleLineBody = body.replace(/\s+/g, " ").trim();
  if (singleLineBody.length <= RESPONSE_PREVIEW_LIMIT) {
    return singleLineBody;
  }

  return `${singleLineBody.slice(0, RESPONSE_PREVIEW_LIMIT - 1)}...`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getResponseMessage(body: string) {
  const normalizedBody = body.trim();
  return normalizedBody.length > 0 ? normalizedBody : "Request succeeded with an empty response";
}

async function showMacNotification(title: string, body: string) {
  const script = `
on run argv
  set notificationTitle to item 1 of argv
  set notificationBody to item 2 of argv
  display notification notificationBody with title notificationTitle
end run
`;

  await runAppleScript("osascript", ["-e", script, title, body]);
}

async function openResponseUrl(responseMessage: string) {
  const trimmedResponse = responseMessage.trim();

  try {
    const url = new URL(trimmedResponse);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Response is not an HTTP URL");
    }

    await open(url.toString());
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "Open URL failed",
      message: "Webhook response is not a valid URL",
    });
  }
}
