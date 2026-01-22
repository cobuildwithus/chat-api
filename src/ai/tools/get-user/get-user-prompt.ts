export const getUserPrompt = async () => `## Get User Details Tool
You have access to the tool called getUser.
This tool allows you to look up details about users who have a Farcaster account.
You can use this to get a user's FID and verified addresses when you need to query information about them.

## Usage
The tool accepts a username (fname) and returns either:

For exact matches:
- FID (Farcaster ID)
- Username (fname) 
- Verified ETH addresses
- usedLikeQuery: false

For fuzzy matches:
- usedLikeQuery: true
- An array of potential matching users with their profile information

You can use this information to:
- Pass the FID to tools that accept user FIDs
- Pass verified addresses to tools that require ETH addresses
- Look up information about specific community members
- Know if the username was matched exactly or approximately

## Important Notes
- Only pass usernames that you know are relevant to the current conversation
- The tool will return null if the user is not found
- Always check the response before using the returned values
- Use the FID when querying user activity and profile information
- The tool first tries an exact match, then falls back to a fuzzy LIKE query if needed

## Example Response
For exact matches:
{
  "fid": number,
  "fname": string,
  "verifiedAddresses": string[],
}

For fuzzy matches:
{
  usedLikeQuery: true,
  users: [
    {
      fid: number,
      fname: string,
      displayName: string,
      avatarUrl: string,
      bio: string,
      verifiedAddresses: string[],
      updatedAt: string
    },
    ...
  ]
}

Use this data carefully and verify the user exists before proceeding with other operations.
If usedLikeQuery is true, examine the returned users array to find the best match.`;
