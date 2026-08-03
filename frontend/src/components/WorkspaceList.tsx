
import { 
  Box, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Typography, 
  IconButton,
  Button
} from '@mui/material';
import { 
  Launch, 
  MoreVert, 
  FolderOutlined 
} from '@mui/icons-material';

interface Workspace {
  id: number;
  name: string;
  updatedAt: string;
  role: string;
}

const workspaces: Workspace[] = [
  { id: 1, name: 'Marketing Dashboard', updatedAt: '2 hours ago', role: 'Admin' },
  { id: 2, name: 'Client Portal', updatedAt: 'Yesterday', role: 'Editor' },
  { id: 3, name: 'Q3 Planning', updatedAt: 'Oct 12, 2026', role: 'Admin' },
  { id: 4, name: 'Team Wiki', updatedAt: 'Sept 30, 2026', role: 'Viewer' },
];

export default function WorkspaceList() {
  const handleOpenWorkspace = (name: string): void => {
    alert(`Opening ${name}`);
  };

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      {/* Header section with Action Button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px' }}>
          Workspaces
        </Typography>
        <Button variant="contained" disableElevation sx={{ bgcolor: '#ffffff', color: '#000000', '&:hover': { bgcolor: '#e5e5e5' } }}>
          New Workspace
        </Button>
      </Box>

      {/* Structured Modern List */}
      <TableContainer sx={{ border: '1px solid #1f1f1f', borderRadius: 2, bgcolor: '#000000' }}>
        <Table>
          <TableHead sx={{ bgcolor: '#0a0a0a' }}>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary', borderBottom: '1px solid #1f1f1f' }}>Name</TableCell>
              <TableCell sx={{ color: 'text.secondary', borderBottom: '1px solid #1f1f1f' }}>Last Updated</TableCell>
              <TableCell sx={{ color: 'text.secondary', borderBottom: '1px solid #1f1f1f' }}>Access Role</TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary', borderBottom: '1px solid #1f1f1f' }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workspaces.map((workspace) => (
              <TableRow 
                key={workspace.id}
                hover
                onClick={() => handleOpenWorkspace(workspace.name)}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#0a0a0a !important' },
                  '& td': { borderBottom: '1px solid #1f1f1f' }
                }}
              >
                {/* Workspace Name & Icon */}
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FolderOutlined sx={{ color: 'text.secondary', fontSize: 20 }} />
                    <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {workspace.name}
                    </Typography>
                  </Box>
                </TableCell>
                
                {/* Metadata Column 1 */}
                <TableCell sx={{ color: 'text.secondary' }}>
                  {workspace.updatedAt}
                </TableCell>
                
                {/* Metadata Column 2 */}
                <TableCell sx={{ color: 'text.secondary' }}>
                  {workspace.role}
                </TableCell>
                
                {/* Action Row Buttons */}
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <IconButton size="small" sx={{ color: 'text.secondary', mr: 1 }} onClick={() => handleOpenWorkspace(workspace.name)}>
                    <Launch fontSize="small" />
                  </IconButton>
                  <IconButton size="small" sx={{ color: 'text.secondary' }}>
                    <MoreVert fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
