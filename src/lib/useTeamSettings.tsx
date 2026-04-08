import { useState, useEffect } from "react";

// TODO move this hook to https://github.com/aha-develop/aha-develop-react

/**
 * Fetch team level extension settings for a given record.
 */
export const useTeamSettings = (
  context: Aha.Context,
  record: { id: string; typename: string },
) => {
  const [settings, setSettings] = useState<Aha.Settings>();
  const [loadingModel, setLoadingModel] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [teamId, setTeamId] = useState<string>();

  useEffect(() => {
    // Load the model from the Aha.RecordStub in order to get the teamId
    if (record.typename === "Feature" || record.typename === "Requirement") {
      setLoadingModel(true);
      const fetchModel =
        record.typename === "Feature"
          ? aha.models.Feature.select("teamId").find(record.id)
          : aha.models.Requirement.select("teamId").find(record.id);
      fetchModel
        .then((model) => {
          setTeamId(model.teamId);
        })
        .finally(() => {
          setLoadingModel(false);
        });
    } else {
      setLoadingModel(false);
    }
  }, [record]);

  useEffect(() => {
    // If the context has a getSettings method, use it to fetch settings for the team.
    if ("getSettings" in context && teamId) {
      setLoadingSettings(true);
      context
        .getSettings({ teamId })
        .then(setSettings)
        .finally(() => {
          setLoadingSettings(false);
        });
    } else {
      // Default to using context.settings if getSettings is not available
      setSettings(context.settings);
      setLoadingSettings(false);
    }
  }, [teamId]);

  return [settings, { loading: loadingModel || loadingSettings }] as const;
};
