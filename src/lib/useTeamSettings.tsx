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
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string>();

  useEffect(() => {
    // Load the model from the Aha.RecordStub in order to get the teamId
    if (record.typename === "Feature" || record.typename === "Requirement") {
      setLoading(true);
      const fetchModel =
        record.typename === "Feature"
          ? aha.models.Feature.select("teamId").find(record.id)
          : aha.models.Requirement.select("teamId").find(record.id);
      fetchModel
        .then((model) => {
          setTeamId(model.teamId);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [record]);

  useEffect(() => {
    // If the context has a getSettings method, use it to fetch settings for the team.
    if ("getSettings" in context && teamId) {
      setLoading(true);
      context
        .getSettings({ teamId })
        .then(setSettings)
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Default to using context.settings if getSettings is not available
      setSettings(context.settings);
      setLoading(false);
    }
  }, [teamId]);

  return [settings, { loading }] as const;
};
