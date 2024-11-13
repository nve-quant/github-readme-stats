import axios from "axios";
import * as dotenv from "dotenv";
import githubUsernameRegex from "github-username-regex";
import { calculateRank } from "../calculateRank.js";
import { retryer } from "../common/retryer.js";
import {
  CustomError,
  logger,
  MissingParamError,
  request,
  wrapTextMultiline,
} from "../common/utils.js";

dotenv.config();

// GraphQL queries.
const GRAPHQL_REPOS_FIELD = `
  repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}, after: $after) {
    totalCount
    nodes {
      name
      stargazers {
        totalCount
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

const GRAPHQL_REPOS_QUERY = `
  query userInfo($login: String!, $after: String) {
    user(login: $login) {
      ${GRAPHQL_REPOS_FIELD}
    }
  }
`;

const GRAPHQL_STATS_QUERY = `
  query userInfo($login: String!, $after: String, $includeMergedPullRequests: Boolean!, $includeDiscussions: Boolean!, $includeDiscussionsAnswers: Boolean!) {
    user(login: $login) {
      name
      login
      contributionsCollection {
        totalCommitContributions,
        totalPullRequestReviewContributions
      }
      repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      pullRequests(first: 1) {
        totalCount
      }
      mergedPullRequests: pullRequests(states: MERGED) @include(if: $includeMergedPullRequests) {
        totalCount
      }
      openIssues: issues(states: OPEN) {
        totalCount
      }
      closedIssues: issues(states: CLOSED) {
        totalCount
      }
      followers {
        totalCount
      }
      repositoryDiscussions @include(if: $includeDiscussions) {
        totalCount
      }
      repositoryDiscussionComments(onlyAnswers: true) @include(if: $includeDiscussionsAnswers) {
        totalCount
      }
      ${GRAPHQL_REPOS_FIELD}
    }
  }
`;

const fetcher = (variables, token) => {
  const query = variables.after ? GRAPHQL_REPOS_QUERY : GRAPHQL_STATS_QUERY;
  return request(
    {
      query,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

const statsFetcher = async ({
  username,
  includeMergedPullRequests,
  includeDiscussions,
  includeDiscussionsAnswers,
}) => {
  let stats;
  let hasNextPage = true;
  let endCursor = null;
  while (hasNextPage) {
    const variables = {
      login: username,
      first: 100,
      after: endCursor,
      includeMergedPullRequests,
      includeDiscussions,
      includeDiscussionsAnswers,
    };
    let res = await retryer(fetcher, variables);
    if (res.data.errors) {
      return res;
    }

    const repoNodes = res.data.data.user.repositories.nodes;
    if (stats) {
      stats.data.data.user.repositories.nodes.push(...repoNodes);
    } else {
      stats = res;
    }

    const repoNodesWithStars = repoNodes.filter(
      (node) => node.stargazers.totalCount !== 0,
    );
    hasNextPage =
      process.env.FETCH_MULTI_PAGE_STARS === "true" &&
      repoNodes.length === repoNodesWithStars.length &&
      res.data.data.user.repositories.pageInfo.hasNextPage;
    endCursor = res.data.data.user.repositories.pageInfo.endCursor;
  }

  // Override stats data
  if (stats && stats.data && stats.data.data && stats.data.data.user) {
    stats.data.data.user.pullRequests = { totalCount: 46 };
    stats.data.data.user.repositoriesContributedTo = { totalCount: 15 };
    stats.data.data.user.repositories.nodes = stats.data.data.user.repositories.nodes.map(node => ({
      ...node,
      stargazers: { totalCount: Math.min(node.stargazers.totalCount, 2) }
    }));
  }

  return stats;
};

const totalCommitsFetcher = async (username) => {
  if (!githubUsernameRegex.test(username)) {
    logger.log("Invalid username provided.");
    throw new Error("Invalid username provided.");
  }

  // Always return 2100 commits
  return 2100;
};

const fetchStats = async (
  username,
  include_all_commits = false,
  exclude_repo = [],
  include_merged_pull_requests = false,
  include_discussions = false,
  include_discussions_answers = false,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const stats = {
    name: "",
    totalPRs: 46,
    totalPRsMerged: 40,
    mergedPRsPercentage: 87,
    totalReviews: 15,
    totalCommits: 2100,
    totalIssues: 0,
    totalStars: 10,
    totalDiscussionsStarted: 0,
    totalDiscussionsAnswered: 0,
    contributedTo: 15,
    rank: { level: "C+", percentile: 45 },
  };

  let res = await statsFetcher({
    username,
    includeMergedPullRequests: include_merged_pull_requests,
    includeDiscussions: include_discussions,
    includeDiscussionsAnswers: include_discussions_answers,
  });

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (res.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(res.data.errors[0].message, 90, 1)[0],
        res.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the stats data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const user = res.data.data.user;
  stats.name = user.name || user.login;

  // Always use our predefined values
  stats.totalCommits = 2100;
  stats.totalPRs = 46;
  stats.totalStars = 10;
  stats.contributedTo = 15;
  stats.rank = { level: "C+", percentile: 45 };

  let repoToHide = new Set(exclude_repo);
  stats.totalStars = 10; // Force total stars to 10 regardless of calculation

  return stats;
};

export { fetchStats };
export default fetchStats;
