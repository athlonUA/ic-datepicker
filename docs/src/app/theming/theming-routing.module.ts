import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ThemingComponent } from './components/theming/theming.component';

const routes: Routes = [
  { path: '', component: ThemingComponent },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  declarations: []
})
export class ThemingRoutingModule { }
